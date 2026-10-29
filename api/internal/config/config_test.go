package config

import "testing"

func TestSelfHostedAdminsAreOperatorConfigured(t *testing.T) {
	t.Setenv("SUPER_ADMIN_EMAILS", "")
	cfg := Load()
	if len(cfg.SuperAdminEmails) != 0 {
		t.Fatalf("fresh installation granted admin accounts: %v", cfg.SuperAdminEmails)
	}
	t.Setenv("SUPER_ADMIN_EMAILS", "Owner@Example.Test, second@example.test")
	cfg = Load()
	if !cfg.IsSuperAdmin("owner@example.test") || !cfg.IsSuperAdmin("SECOND@example.test") {
		t.Fatal("configured administrators not recognized")
	}
	if cfg.IsSuperAdmin("stranger@example.test") {
		t.Fatal("unconfigured account is admin")
	}
}
