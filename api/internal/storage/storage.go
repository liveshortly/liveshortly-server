// Package storage is a filesystem blob store rooted at a base directory.
package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Store writes session blobs under a root directory.
type Store struct {
	root string
}

// New returns a Store rooted at root.
func New(root string) *Store {
	return &Store{root: root}
}

// Put writes bytes to sessions/{sessionID}/{filename} relative to the root,
// creating directories as needed. It rejects filenames or session ids that
// attempt path traversal. Returns the storage key (relative path) on success.
func (s *Store) Put(sessionID, filename string, data []byte) (string, error) {
	if err := safeName(sessionID); err != nil {
		return "", fmt.Errorf("session id: %w", err)
	}
	if err := safeName(filename); err != nil {
		return "", fmt.Errorf("filename: %w", err)
	}

	key := filepath.Join("sessions", sessionID, filename)
	full := filepath.Join(s.root, key)
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(full, data, 0o644); err != nil {
		return "", err
	}
	return key, nil
}

// safeName rejects empty names, absolute paths, and any ".." traversal segment.
func safeName(name string) error {
	if name == "" {
		return fmt.Errorf("empty name")
	}
	if strings.Contains(name, "..") {
		return fmt.Errorf("path traversal not allowed")
	}
	if filepath.IsAbs(name) {
		return fmt.Errorf("absolute path not allowed")
	}
	return nil
}
