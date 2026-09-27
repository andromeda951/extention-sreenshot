package main

import (
	"fmt"
	"log"
	"net/http"
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

// Handler WebSocket untuk endpoint /ws
func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Gagal upgrade ke WebSocket: %v\n", err)
		return
	}
	defer conn.Close()

	fmt.Println("client connected")

	// Set batas waktu baca pertama; di-reset setiap kali pong diterima
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// Goroutine: kirim ping ke client setiap pingInterval
	go func() {
		ticker := time.NewTicker(pingInterval)
		defer ticker.Stop()
		for range ticker.C {
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return // client sudah tidak ada
			}
		}
	}()

	// Loop membaca pesan dari client hingga koneksi terputus
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			fmt.Println("client disconnected")
			break
		}
	}
}

func main() {
	port := ":8080"
	http.HandleFunc("/ws", handleWebSocket)

	fmt.Printf("Server berjalan di port %s (WebSocket endpoint: ws://localhost%s/ws)\n", port, port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("Server error: %v\n", err)
	}
}
