package store_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"liveshortly/internal/testutil"
)

// Admin is an authorization decision and it has exactly one source: the
// users.is_admin column. Nothing in the environment grants it, so what is
// worth pinning is that nobody holds it by accident and that writing the
// column is what changes the answer.
func TestAdminIsTheColumn(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	st := d.Store

	uniq := time.Now().UnixNano()
	u, err := st.UpsertGoogleUser(ctx,
		fmt.Sprintf("admin-test-%d", uniq),
		fmt.Sprintf("owner+%d@example.test", uniq),
		"Owner", "")
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

	// Nobody is an admin by signing up.
	mustAdmin(false, "for a freshly created user")

	// An id that does not exist is not an admin, and not an error either —
	// the handlers treat an error as "not admin", so a missing row must not
	// look like a failure.
	if got, err := st.IsAdmin(ctx, "00000000-0000-0000-0000-000000000000"); err != nil || got {
		t.Fatalf("unknown user: got %v, err %v — want false, nil", got, err)
	}

	// Granting is a write to the column, which is the whole interface.
	if _, err := d.Pool.Exec(ctx,
		`UPDATE users SET is_admin = true WHERE id = $1`, u.ID); err != nil {
		t.Fatalf("grant: %v", err)
	}
	mustAdmin(true, "after the grant")

	// Migrations run on every boot and must not disturb a grant.
	if err := st.Migrate(ctx); err != nil {
		t.Fatalf("Migrate after grant: %v", err)
	}
	mustAdmin(true, "after a restart")

	// A revoke sticks, including across a restart.
	if _, err := d.Pool.Exec(ctx,
		`UPDATE users SET is_admin = false WHERE id = $1`, u.ID); err != nil {
		t.Fatalf("revoke: %v", err)
	}
	if err := st.Migrate(ctx); err != nil {
		t.Fatalf("Migrate after revoke: %v", err)
	}
	mustAdmin(false, "after a revoke and a restart")
}
