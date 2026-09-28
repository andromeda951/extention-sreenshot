package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Interval ping dari server ke client
	pingInterval = 30 * time.Second
	// Batas waktu menunggu pong dari client
	pongWait = 60 * time.Second
	// Batas waktu menulis ke client
	writeWait = 10 * time.Second
)

// Konfigurasi upgrader WebSocket
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Mengizinkan koneksi dari semua origin, termasuk Chrome Extension (chrome-extension://...)
		return true
	},
}

// Client merepresentasikan satu koneksi WebSocket yang terdaftar.
type Client struct {
	conn     *websocket.Conn
	mode     string // "teacher" atau "student"
	name     string // nama student (kosong untuk teacher)
	roomCode string
	send     chan []byte
}

// Hub menyimpan semua client aktif, dikelompokkan per room code.
// Hanya di memory, tanpa database.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*Client]bool // roomCode -> set of clients
}

func newHub() *Hub {
	return &Hub{
		rooms: make(map[string]map[*Client]bool),
	}
}

// register menambahkan client ke room.
func (h *Hub) register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[c.roomCode] == nil {
		h.rooms[c.roomCode] = make(map[*Client]bool)
	}
	h.rooms[c.roomCode][c] = true
}

// unregister menghapus client dari room.
func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if clients, ok := h.rooms[c.roomCode]; ok {
		delete(clients, c)
		if len(clients) == 0 {
			delete(h.rooms, c.roomCode)
		}
	}
}

// studentNames mengembalikan daftar nama student yang sedang online di room.
func (h *Hub) studentNames(roomCode string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	names := []string{}
	for c := range h.rooms[roomCode] {
		if c.mode == "student" {
			names = append(names, c.name)
		}
	}
	return names
}

// broadcastToTeachers mengirim pesan ke semua teacher di room.
func (h *Hub) broadcastToTeachers(roomCode string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[roomCode] {
		if c.mode == "teacher" {
			select {
			case c.send <- msg:
			default:
				// Buffer penuh, abaikan.
			}
		}
	}
}

// broadcastToStudents mengirim pesan ke semua student di room.
func (h *Hub) broadcastToStudents(roomCode string, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[roomCode] {
		if c.mode == "student" {
			select {
			case c.send <- msg:
			default:
				// Buffer penuh, abaikan.
			}
		}
	}
}

// sendToStudent mengirim pesan ke satu student tertentu di room berdasarkan nama.
// Mengembalikan true jika student ditemukan dan pesan terkirim.
func (h *Hub) sendToStudent(roomCode, studentName string, msg []byte) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[roomCode] {
		if c.mode == "student" && c.name == studentName {
			select {
			case c.send <- msg:
				return true
			default:
				return false
			}
		}
	}
	return false
}

// notifyStudentList mengirim daftar student terbaru ke semua teacher di room.
func (h *Hub) notifyStudentList(roomCode string) {
	names := h.studentNames(roomCode)
	msg, _ := json.Marshal(map[string]interface{}{
		"type":     "student_list",
		"students": names,
	})
	h.broadcastToTeachers(roomCode, msg)
}

// writePump mengirim pesan dari channel send ke koneksi WebSocket.
// Hanya goroutine ini yang boleh menulis ke conn, mencegah concurrent write.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingInterval)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return // client sudah tidak ada
			}
		}
	}
}

// Hub global untuk semua koneksi.
var hub = newHub()

// Handler WebSocket untuk endpoint /ws
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Gagal upgrade ke WebSocket: %v\n", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan []byte, 1024),
	}

	// Pesan pertama harus berupa register: {type:"register", mode, student_name, room_code}
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, data, err := conn.ReadMessage()
	if err != nil {
		conn.Close()
		return
	}

	var reg struct {
		Type        string `json:"type"`
		Mode        string `json:"mode"`
		StudentName string `json:"student_name"`
		RoomCode    string `json:"room_code"`
	}
	if err := json.Unmarshal(data, &reg); err != nil || reg.Type != "register" || reg.RoomCode == "" {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","message":"Invalid register message"}`))
		conn.Close()
		return
	}

	if reg.Mode != "teacher" && reg.Mode != "student" {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","message":"Invalid mode"}`))
		conn.Close()
		return
	}

	if reg.Mode == "student" && reg.StudentName == "" {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","message":"Student name required"}`))
		conn.Close()
		return
	}

	client.mode = reg.Mode
	client.name = reg.StudentName
	client.roomCode = reg.RoomCode

	hub.register(client)
	defer func() {
		hub.unregister(client)
		// Jika student disconnect, beri tahu teacher di room yang sama.
		if client.mode == "student" {
			hub.notifyStudentList(client.roomCode)
		}
	}()

	// Kirim ack register ke client.
	ack, _ := json.Marshal(map[string]interface{}{
		"type":      "registered",
		"mode":      client.mode,
		"room_code": client.roomCode,
	})
	client.send <- ack

	// Teacher langsung menerima daftar student yang sedang online.
	if client.mode == "teacher" {
		hub.notifyStudentList(client.roomCode)
	}

	// Student baru connect, beri tahu teacher di room yang sama.
	if client.mode == "student" {
		hub.notifyStudentList(client.roomCode)
	}

	// Set batas waktu baca; di-reset setiap kali pong diterima
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// Mulai write pump (mengirim pesan + ping).
	go client.writePump()

	// Loop membaca pesan dari client hingga koneksi terputus
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg map[string]interface{}
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		msgType, _ := msg["type"].(string)

		switch msgType {
		case "screenshot_request":
			// Teacher meminta screenshot dari satu student atau semua student.
			if client.mode != "teacher" {
				continue
			}
			target, _ := msg["target"].(string)
			reqMsg, _ := json.Marshal(map[string]interface{}{
				"type": "screenshot_request",
			})
			if target == "all" || target == "" {
				hub.broadcastToStudents(client.roomCode, reqMsg)
			} else {
				hub.sendToStudent(client.roomCode, target, reqMsg)
			}

		case "screenshot_result":
			// Student mengirim hasil screenshot, teruskan ke semua teacher di room.
			if client.mode != "student" {
				continue
			}
			imageData, _ := msg["image_data"].(string)
			if imageData == "" {
				continue
			}
			resultMsg, _ := json.Marshal(map[string]interface{}{
				"type":         "screenshot_result",
				"student_name": client.name,
				"image_data":   imageData,
			})
			hub.broadcastToTeachers(client.roomCode, resultMsg)
		}
	}

	fmt.Printf("client disconnected: mode=%s name=%s room=%s\n", client.mode, client.name, client.roomCode)
}

func main() {
	port := ":8080"
	http.HandleFunc("/ws", handleWebSocket)

	fmt.Printf("Server berjalan di port %s (WebSocket endpoint: ws://localhost%s/ws)\n", port, port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("Server error: %v\n", err)
	}
}