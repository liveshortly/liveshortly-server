package store_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

// LSW-33: LiveShortly has no profile pictures. The column is gone after the
// boot migrations, and no user shape the API serialises carries one.
func TestNoProfilePictures(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()

	var n int
	if err := d.Pool.QueryRow(ctx, `SELECT count(*) FROM information_schema.columns
		WHERE table_name = 'users' AND column_name = 'avatar_url'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("users.avatar_url still exists after Migrate")
	}

	for _, v := range []any{store.User{}, store.AdminUser{}} {
		b, _ := json.Marshal(v)
		if s := strings.ToLower(string(b)); strings.Contains(s, "avatar") || strings.Contains(s, "picture") {
			t.Fatalf("%T serialises a picture field: %s", v, b)
		}
	}
}
