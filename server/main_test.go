package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func dialWS(t *testing.T, server *httptest.Server) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http")
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Gagal terhubung ke WebSocket: %v", err)
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("Expected 101, got %d", resp.StatusCode)
	}
	return conn
}

func registerClient(t *testing.T, conn *websocket.Conn, mode, name, room string) {
	t.Helper()
	msg := map[string]string{
		"type":         "register",
		"mode":         mode,
		"student_name": name,
		"room_code":    room,
	}
	data, _ := json.Marshal(msg)
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("Gagal kirim register: %v", err)
	}
}

func readMessage(t *testing.T, conn *websocket.Conn) map[string]interface{} {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, data, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("Gagal baca pesan: %v", err)
	}
	var msg map[string]interface{}
	if err := json.Unmarshal(data, &msg); err != nil {
		t.Fatalf("Pesan bukan JSON valid: %v", err)
	}
	return msg
}

func TestWebSocketConnectAndDisconnect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(handleWebSocket))
	defer server.Close()

	conn := dialWS(t, server)
	defer conn.Close()

	registerClient(t, conn, "student", "Budi", "ABC123")

	// Harus menerima ack "registered"
	msg := readMessage(t, conn)
	if msg["type"] != "registered" {
		t.Fatalf("Expected registered, got %v", msg["type"])
	}

	time.Sleep(100 * time.Millisecond)
	conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
	conn.Close()
	time.Sleep(100 * time.Millisecond)
}

func TestTeacherReceivesStudentList(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(handleWebSocket))
	defer server.Close()

	// Teacher connect dulu
	teacher := dialWS(t, server)
	defer teacher.Close()
	registerClient(t, teacher, "teacher", "", "ABC123")

	// Teacher menerima ack registered
	msg := readMessage(t, teacher)
	if msg["type"] != "registered" {
		t.Fatalf("Expected registered, got %v", msg["type"])
	}

	// Teacher menerima student_list kosong
	msg = readMessage(t, teacher)
	if msg["type"] != "student_list" {
		t.Fatalf("Expected student_list, got %v", msg["type"])
	}

	// Student Budi connect
	budi := dialWS(t, server)
	defer budi.Close()
	registerClient(t, budi, "student", "Budi", "ABC123")

	// Budi menerima ack registered
	msg = readMessage(t, budi)
	if msg["type"] != "registered" {
		t.Fatalf("Expected registered, got %v", msg["type"])
	}

	// Teacher menerima student_list berisi Budi
	msg = readMessage(t, teacher)
	if msg["type"] != "student_list" {
		t.Fatalf("Expected student_list, got %v", msg["type"])
	}
	students := msg["students"].([]interface{})
	if len(students) != 1 || students[0] != "Budi" {
		t.Fatalf("Expected [Budi], got %v", students)
	}

	// Student Andi connect
	andi := dialWS(t, server)
	defer andi.Close()
	registerClient(t, andi, "student", "Andi", "ABC123")

	// Andi menerima ack registered
	msg = readMessage(t, andi)
	if msg["type"] != "registered" {
		t.Fatalf("Expected registered, got %v", msg["type"])
	}

	// Teacher menerima student_list berisi Budi dan Andi
	msg = readMessage(t, teacher)
	if msg["type"] != "student_list" {
		t.Fatalf("Expected student_list, got %v", msg["type"])
	}
	students = msg["students"].([]interface{})
	if len(students) != 2 {
		t.Fatalf("Expected 2 students, got %v", students)
	}

	// Budi disconnect
	budi.Close()
	time.Sleep(200 * time.Millisecond)

	// Teacher menerima student_list berisi Andi saja
	msg = readMessage(t, teacher)
	if msg["type"] != "student_list" {
		t.Fatalf("Expected student_list, got %v", msg["type"])
	}
	students = msg["students"].([]interface{})
	if len(students) != 1 || students[0] != "Andi" {
		t.Fatalf("Expected [Andi], got %v", students)
	}
}

func TestStudentInDifferentRoomNotSentToTeacher(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(handleWebSocket))
	defer server.Close()

	// Teacher di room ABC123
	teacher := dialWS(t, server)
	defer teacher.Close()
	registerClient(t, teacher, "teacher", "", "ABC123")

	msg := readMessage(t, teacher) // registered
	if msg["type"] != "registered" {
		t.Fatalf("Expected registered, got %v", msg["type"])
	}
	msg = readMessage(t, teacher) // student_list kosong
	if msg["type"] != "student_list" {
		t.Fatalf("Expected student_list, got %v", msg["type"])
	}

	// Student di room lain XYZ999
	other := dialWS(t, server)
	defer other.Close()
	registerClient(t, other, "student", "Caca", "XYZ999")

	msg = readMessage(t, other) // registered
	if msg["type"] != "registered" {
		t.Fatalf("Expected registered, got %v", msg["type"])
	}

	// Teacher tidak boleh menerima pesan apa pun (student di room lain)
	teacher.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	_, _, err := teacher.ReadMessage()
	if err == nil {
		t.Fatalf("Teacher tidak seharusnya menerima pesan dari student di room lain")
	}
}