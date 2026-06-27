// Package httpx contains small HTTP helpers shared by the handlers.
package httpx

import (
	"encoding/json"
	"net/http"
)

// JSON writes v as a JSON response with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes a JSON error envelope: {"error":"msg"}.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, map[string]string{"error": msg})
}
