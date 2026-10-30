package config

import "testing"

// SUPER_ADMIN_EMAILS no longer decides anything at request time — admin is
// users.is_admin. All this list still does is seed that column once, in
// store.Migrate, so what matters here is that a fresh installation grants
// nobody and that the parsing is forgiving about case and spacing.
func TestSuperAdminBootstrapListParsing(t *testing.T) {
	t.Setenv("SUPER_ADMIN_EMAILS", "")
	cfg := Load()
	if len(cfg.SuperAdminEmails) != 0 {
		t.Fatalf("fresh installation seeded admin accounts: %v", cfg.SuperAdminEmails)
	}

	t.Setenv("SUPER_ADMIN_EMAILS", "Owner@Example.Test, second@example.test")
	cfg = Load()
	if len(cfg.SuperAdminEmails) != 2 {
		t.Fatalf("expected 2 bootstrap entries, got %v", cfg.SuperAdminEmails)
	}
	// Lower-cased and trimmed, so the seeding query can match on lower(email).
	for i, want := range []string{"owner@example.test", "second@example.test"} {
		if cfg.SuperAdminEmails[i] != want {
			t.Fatalf("entry %d = %q, want %q", i, cfg.SuperAdminEmails[i], want)
		}
	}
}
