package store

import "testing"

func TestValidUUID(t *testing.T) {
	for id, want := range map[string]bool{
		"5cb7c38c-1b2a-4c3d-8e9f-0a1b2c3d4e5f": true,
		"5cb7c38c":                             false,
		"":                                     false,
		"not-a-uuid":                           false,
	} {
		if got := validUUID(id); got != want {
			t.Errorf("validUUID(%q) = %v, want %v", id, got, want)
		}
	}
}
