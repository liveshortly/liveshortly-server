package store_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"liveshortly/internal/testutil"
)

// Admin is an authorization decision, so the things worth pinning are that
// nobody gets it by accident, that the one-time bootstrap seeds the configured
// addresses, and that it does not quietly undo a deliberate revoke on the next
// restart — which is the failure mode of re-asserting an allowlist every boot.
func TestAdminGrantAndBootstrap(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	st := d.Store

	uniq := time.Now().UnixNano()
	sub := fmt.Sprintf("admin-test-%d", uniq)
	// Mixed case on purpose: config lower-cases the list, the stored row keeps
	// whatever Google sent, so the seeding query has to match on lower(email).
	email := fmt.Sprintf("Owner+%d@Example.Test", uniq)

	u, err := st.UpsertGoogleUser(ctx, sub, email, "Owner", "")
	if err != nil {
		t.Fatalf("UpsertGoogleUser: %v", err)
	}
	t.Cleanup(func() {
		_, _ = d.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, u.ID)
	})

	mustAdmin := func(want bool, when string) {
		t.Helper()
		got, err := st.IsAdmin(ctx, u.ID)
		if err != nil {
			t.Fatalf("IsAdmin (%s): %v", when, err)
		}
		if got != want {
			t.Fatalf("is_admin = %v %s, want %v", got, when, want)
		}
	}

	// The bootstrap claim is global and permanent by design, so this test has
	// to release it to exercise the seeding — and put it back afterwards, so a
	// real deployment's "already seeded" state is never disturbed by a test run.
	var hadClaim bool
	if err := d.Pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM schema_bootstrap WHERE key = 'admin_seed')`,
	).Scan(&hadClaim); err != nil {
		t.Fatalf("read bootstrap claim: %v", err)
	}
	if _, err := d.Pool.Exec(ctx,
		`DELETE FROM schema_bootstrap WHERE key = 'admin_seed'`); err != nil {
		t.Fatalf("clear bootstrap claim: %v", err)
	}
	t.Cleanup(func() {
		if hadClaim {
			_, _ = d.Pool.Exec(ctx,
				`INSERT INTO schema_bootstrap (key) VALUES ('admin_seed')
				 ON CONFLICT (key) DO NOTHING`)
		} else {
			_, _ = d.Pool.Exec(ctx,
				`DELETE FROM schema_bootstrap WHERE key = 'admin_seed'`)
		}
	})

	mustAdmin(false, "for a freshly created user")

	// An id that does not exist is not an admin, and not an error either.
	if got, err := st.IsAdmin(ctx, "00000000-0000-0000-0000-000000000000"); err != nil || got {
		t.Fatalf("unknown user: got %v, err %v — want false, nil", got, err)
	}

	// The bootstrap grants the configured address.
	bootstrap := []string{strings.ToLower(email)}
	if err := st.Migrate(ctx, bootstrap); err != nil {
		t.Fatalf("Migrate with bootstrap: %v", err)
	}
	mustAdmin(true, "after the bootstrap")

	// Running it again changes nothing.
	if err := st.Migrate(ctx, bootstrap); err != nil {
		t.Fatalf("Migrate rerun: %v", err)
	}
	mustAdmin(true, "after a second boot")

	// A revoke must stick across restarts. If the bootstrap re-asserted the
	// allowlist unconditionally, this would silently hand admin back.
	if _, err := d.Pool.Exec(ctx,
		`UPDATE users SET is_admin = false WHERE id = $1`, u.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if err := st.Migrate(ctx, bootstrap); err != nil {
		t.Fatalf("Migrate after revoke: %v", err)
	}
	mustAdmin(false, "after a revoke and another boot")

	// An empty bootstrap list is a no-op, not an error.
	if err := st.Migrate(ctx, nil); err != nil {
		t.Fatalf("Migrate with no bootstrap list: %v", err)
	}
}
