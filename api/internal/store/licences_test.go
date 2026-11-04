package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

func TestLicencePlan(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	d.Store.Plans = store.PlanLimits{FreeSessions: 3, ProSessions: 100, ProStorageBytes: 1 << 30}
	mk := func(p string) string {
		u, err := d.Store.GetOrCreateUser(ctx, uniqueHandle(p))
		if err != nil {
			t.Fatal(err)
		}
		return u.ID
	}
	plan := func(uid string) store.QuotaUsage {
		qu, err := d.Store.GetQuotaUsage(ctx, uid, 100<<20, 10)
		if err != nil {
			t.Fatal(err)
		}
		return qu
	}
	n := time.Now().UnixNano()
	id := func(s string) string { return fmt.Sprintf("%s-%d", s, n) }
	soon, past := time.Now().Add(time.Hour), time.Now().Add(-time.Hour)

	a, b := mk("lica"), mk("licb")
	if q := plan(a); q.Plan != "free" || q.SessionLimit != 3 {
		t.Fatalf("free: %+v", q)
	}
	// active licence -> pro
	if err := d.Store.AddLicence(ctx, a, id("L1"), "ls-pro", "k", &soon); err != nil {
		t.Fatal(err)
	}
	if q := plan(a); q.Plan != "ls_pro" || q.SessionLimit != 100 || q.StorageLimitBytes != 1<<30 {
		t.Fatalf("pro: %+v", q)
	}
	// same key re-added by owner is fine; another account is refused
	if err := d.Store.AddLicence(ctx, a, id("L1"), "ls-pro", "k", &soon); err != nil {
		t.Fatalf("re-add: %v", err)
	}
	if err := d.Store.AddLicence(ctx, b, id("L1"), "ls-pro", "k", &soon); !errors.Is(err, store.ErrLicenceTaken) {
		t.Fatalf("want taken, got %v", err)
	}
	// revoked -> back to free, row kept
	if err := d.Store.RevokeLicences(ctx, []string{id("L1")}); err != nil {
		t.Fatal(err)
	}
	if q := plan(a); q.Plan != "free" {
		t.Fatalf("revoked: %+v", q)
	}
	ls, _ := d.Store.ListLicences(ctx, a)
	if len(ls) != 1 || ls[0].Status != "revoked" {
		t.Fatalf("list: %+v", ls)
	}
	// expired (no background job) -> free; other product doesn't count
	_ = d.Store.AddLicence(ctx, b, id("L2"), "ls-pro", "k", &past)
	_ = d.Store.AddLicence(ctx, b, id("L3"), "pocketai-mac", "k", nil)
	if q := plan(b); q.Plan != "free" {
		t.Fatalf("expired/mac: %+v", q)
	}
	if ls, _ := d.Store.ListLicences(ctx, b); len(ls) != 2 || ls[1].Status != "expired" && ls[0].Status != "expired" {
		t.Fatalf("expired status: %+v", ls)
	}
	// session cap uses the effective plan: pro user may exceed the free cap
	_ = d.Store.AddLicence(ctx, b, id("L4"), "ls-pro", "k", nil)
	for i := 0; i < 4; i++ {
		if _, err := d.Store.CreateSession(ctx, b, store.NewSessionInput{}, bigStorage, bigLive); err != nil {
			t.Fatalf("pro create %d: %v", i, err)
		}
	}
	// admin 'custom' plan is untouched by licences
	if _, err := d.Pool.Exec(ctx, `UPDATE users SET plan='custom' WHERE id=$1`, b); err != nil {
		t.Fatal(err)
	}
	if q := plan(b); q.Plan != "custom" {
		t.Fatalf("custom: %+v", q)
	}
	// delete frees the key
	if ok, err := d.Store.DeleteLicence(ctx, a, id("L1")); !ok || err != nil {
		t.Fatalf("delete: %v %v", ok, err)
	}
	if err := d.Store.AddLicence(ctx, b, id("L1"), "ls-pro", "k", &soon); err != nil {
		t.Fatalf("re-add elsewhere: %v", err)
	}
}
