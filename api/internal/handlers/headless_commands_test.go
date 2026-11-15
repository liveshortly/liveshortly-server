package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"liveshortly/internal/auth"
	"liveshortly/internal/config"
	"liveshortly/internal/store"
	"liveshortly/internal/testutil"
)

func strp(s string) *string { return &s }

// sessionAgent prefers Agent over Framework and tolerates nils. Pure, no infra.
func TestSessionAgent(t *testing.T) {
	cases := []struct {
		agent, fw, want string
	}{
		{"pi", "pi", "pi"},
		{"", "claude-code", "claude-code"},
		{"claude", "", "claude"},
		{"", "", ""},
	}
	for _, c := range cases {
		s := &store.Session{}
		if c.agent != "" {
			s.Agent = strp(c.agent)
		}
		if c.fw != "" {
			s.Framework = strp(c.fw)
		}
		if got := sessionAgent(s); got != c.want {
			t.Errorf("sessionAgent(%q,%q) = %q, want %q", c.agent, c.fw, got, c.want)
		}
	}
}

// catalogMatches maps a session's framework label to the host's agent name, and
// defaultModelSwitchable mirrors the switch endpoint's accepted agents. Pure.
func TestCatalogMatchAndDefaults(t *testing.T) {
	match := []struct{ host, want string }{
		{"pi", "pi"},
		{"claude", "claude-code"}, // framework label resolves to host agent
		{"codex", "codex"},
	}
	for _, c := range match {
		if !catalogMatches(c.host, c.want) {
			t.Errorf("catalogMatches(%q,%q) = false, want true", c.host, c.want)
		}
	}
	if catalogMatches("pi", "claude-code") {
		t.Error("pi host must not match a claude-code session")
	}
	for _, a := range []string{"claude", "claude-code", "pi"} {
		if !defaultModelSwitchable(a) {
			t.Errorf("defaultModelSwitchable(%q) = false, want true", a)
		}
	}
	for _, a := range []string{"codex", "terminal", ""} {
		if defaultModelSwitchable(a) {
			t.Errorf("defaultModelSwitchable(%q) = true, want false", a)
		}
	}
}

// End-to-end: a headless (pi) session's /model and /abort deliver a command on
// the session's agent channel; a non-switchable agent is rejected. Skips
// cleanly without Postgres+Redis.
func TestHeadlessCommandsDeliverOnAgentStream(t *testing.T) {
	d := testutil.Setup(t)
	ctx := context.Background()
	h := New(d.Store, d.Bus, d.Blob, config.Config{DefaultStorageLimitBytes: 1 << 62})

	uniq := time.Now().UnixNano()
	u, err := d.Store.UpsertGoogleUser(ctx, fmt.Sprintf("hc-%d", uniq), fmt.Sprintf("hc+%d@example.test", uniq), "HC")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = d.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, u.ID) })
	me := auth.Identity{ID: u.ID, Email: u.Email}

	newSession := func(agent string) store.Session {
		s, err := d.Store.CreateSession(ctx, u.ID, store.NewSessionInput{
			Agent: strp(agent), Framework: strp(agent),
		}, 1<<62, 1<<30)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = d.Store.DeleteSession(ctx, s.ID) })
		return s
	}

	// Subscribe to a session's agent channel and return the next payload.
	nextFrame := func(sub *redis.PubSub) map[string]string {
		t.Helper()
		msg, err := sub.ReceiveTimeout(ctx, 2*time.Second)
		if err != nil {
			t.Fatalf("receive: %v", err)
		}
		m, ok := msg.(*redis.Message)
		if !ok {
			t.Fatalf("want *redis.Message, got %T", msg)
		}
		var out map[string]string
		if err := json.Unmarshal([]byte(m.Payload), &out); err != nil {
			t.Fatalf("payload %q: %v", m.Payload, err)
		}
		return out
	}

	post := func(h http.HandlerFunc, id, body string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		h(rec, pushReq(http.MethodPost, id, me, body))
		return rec
	}

	t.Run("pi model switch publishes set_model", func(t *testing.T) {
		s := newSession("pi")
		sub := d.Bus.SubscribeAgent(ctx, s.ID)
		defer sub.Close()
		if _, err := sub.Receive(ctx); err != nil {
			t.Fatalf("subscribe confirm: %v", err)
		}
		if rec := post(h.SetSessionModel, s.ID, `{"model":"openai/gpt-5"}`); rec.Code != http.StatusOK {
			t.Fatalf("model = %d %s", rec.Code, rec.Body)
		}
		f := nextFrame(sub)
		if f["type"] != "set_model" || f["model"] != "openai/gpt-5" || f["session_id"] != s.ID {
			t.Fatalf("frame = %v", f)
		}
	})

	t.Run("pi invalid model id is 400", func(t *testing.T) {
		s := newSession("pi")
		if rec := post(h.SetSessionModel, s.ID, `{"model":"bad model!"}`); rec.Code != http.StatusBadRequest {
			t.Fatalf("model = %d %s", rec.Code, rec.Body)
		}
	})

	t.Run("abort publishes abort", func(t *testing.T) {
		s := newSession("pi")
		sub := d.Bus.SubscribeAgent(ctx, s.ID)
		defer sub.Close()
		if _, err := sub.Receive(ctx); err != nil {
			t.Fatalf("subscribe confirm: %v", err)
		}
		if rec := post(h.AbortSession, s.ID, ``); rec.Code != http.StatusOK {
			t.Fatalf("abort = %d %s", rec.Code, rec.Body)
		}
		if f := nextFrame(sub); f["type"] != "abort" || f["session_id"] != s.ID {
			t.Fatalf("frame = %v", f)
		}
	})

	t.Run("claude abort goes to the host stream, not the agent stream", func(t *testing.T) {
		s := newSession("claude-code")
		// An online host to receive the abort command.
		rec := hostRecord{ID: "box2", Agents: []string{"claude"}, SeenAt: time.Now().UTC().Format(time.RFC3339)}
		raw, _ := json.Marshal(rec)
		if err := d.Bus.HostSet(ctx, u.ID, "box2", string(raw)); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = d.Bus.HostDrop(ctx, u.ID, "box2") })

		// Watch the agent channel: a claude abort must NOT publish there.
		sub := d.Bus.SubscribeAgent(ctx, s.ID)
		defer sub.Close()
		if _, err := sub.Receive(ctx); err != nil {
			t.Fatalf("subscribe confirm: %v", err)
		}

		if r := post(h.AbortSession, s.ID, ``); r.Code != http.StatusOK {
			t.Fatalf("abort = %d %s", r.Code, r.Body)
		}
		// The abort command landed on the host command queue.
		cmds, err := d.Bus.DrainHost(ctx, u.ID, "box2")
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, c := range cmds {
			var m map[string]any
			if json.Unmarshal(c, &m) == nil && m["type"] == "abort" && m["session_id"] == s.ID {
				found = true
			}
		}
		if !found {
			t.Fatalf("abort not on host queue: %v", cmds)
		}
		// Nothing was published on the agent channel.
		if _, err := sub.ReceiveTimeout(ctx, 300*time.Millisecond); err == nil {
			t.Fatal("claude abort leaked onto the agent stream")
		}
	})

	t.Run("non-switchable agent model is 409", func(t *testing.T) {
		s := newSession("codex")
		if rec := post(h.SetSessionModel, s.ID, `{"model":"opus"}`); rec.Code != http.StatusConflict {
			t.Fatalf("model = %d %s", rec.Code, rec.Body)
		}
	})

	t.Run("comment images publish attach_image before the comment, no blob stored", func(t *testing.T) {
		s := newSession("pi")
		sub := d.Bus.SubscribeAgent(ctx, s.ID)
		defer sub.Close()
		if _, err := sub.Receive(ctx); err != nil {
			t.Fatalf("subscribe confirm: %v", err)
		}
		png := "iVBORw0KGgo=" // small valid base64
		body := fmt.Sprintf(`{"message":"see [Image #1]","images":["data:image/png;base64,%s"]}`, png)
		rec := httptest.NewRecorder()
		h.PostComment(rec, pushReq(http.MethodPost, s.ID, me, body))
		if rec.Code != http.StatusCreated {
			t.Fatalf("comment = %d %s", rec.Code, rec.Body)
		}
		// The created event must not carry the base64.
		if strings.Contains(rec.Body.String(), png) {
			t.Fatalf("event leaked image blob: %s", rec.Body)
		}

		// Frame order on the agent stream: attach_image (index 1) then viewer_comment.
		nextAny := func() map[string]any {
			t.Helper()
			msg, err := sub.ReceiveTimeout(ctx, 2*time.Second)
			if err != nil {
				t.Fatalf("receive: %v", err)
			}
			var out map[string]any
			if err := json.Unmarshal([]byte(msg.(*redis.Message).Payload), &out); err != nil {
				t.Fatalf("decode: %v", err)
			}
			return out
		}
		first := nextAny()
		if first["type"] != "attach_image" || first["mime"] != "image/png" || first["data"] != png || first["index"] != float64(1) {
			t.Fatalf("first frame = %v, want attach_image", first)
		}
		second := nextAny()
		if second["type"] != "viewer_comment" {
			t.Fatalf("second frame = %v, want viewer_comment", second)
		}

		// The pending queue (what the sidecar drains) carries only text, no blob.
		pend, err := d.Bus.PendingPeek(ctx, s.ID)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range pend {
			if strings.Contains(c, png) {
				t.Fatalf("pending queue leaked image blob: %s", c)
			}
		}
	})

	t.Run("session detail carries this agent's model catalog (owner only)", func(t *testing.T) {
		s := newSession("pi")
		// Seed an online host offering pi with a two-model catalog.
		rec := hostRecord{
			ID: "box", Agents: []string{"pi"},
			AgentModels: []agentModels{{
				Name:            "pi",
				Models:          []modelOption{{ID: "openai/gpt-5", Label: "GPT-5"}, {ID: "anthropic/opus", Label: "Opus"}},
				DefaultModel:    "openai/gpt-5",
				ModelSwitchable: true,
			}},
			SeenAt: time.Now().UTC().Format(time.RFC3339),
		}
		raw, _ := json.Marshal(rec)
		if err := d.Bus.HostSet(ctx, u.ID, "box", string(raw)); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = d.Bus.HostDrop(ctx, u.ID, "box") })

		detail := func(p auth.Identity) sessionWithEvents {
			rr := httptest.NewRecorder()
			h.GetSession(rr, pushReq(http.MethodGet, s.ID, p, ""))
			if rr.Code != http.StatusOK {
				t.Fatalf("detail = %d %s", rr.Code, rr.Body)
			}
			var out sessionWithEvents
			if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
				t.Fatalf("decode: %v", err)
			}
			return out
		}

		owner := detail(me)
		if !owner.ModelSwitchable || owner.DefaultModel != "openai/gpt-5" || len(owner.Models) != 2 {
			t.Fatalf("owner catalog = %+v", owner)
		}
		if owner.Models[0].ID != "openai/gpt-5" || owner.Models[0].Label != "GPT-5" {
			t.Fatalf("owner models[0] = %+v", owner.Models[0])
		}

		// A non-owner reader gets no catalog even though the session is public.
		rr := httptest.NewRecorder()
		h.PatchSession(rr, pushReq(http.MethodPatch, s.ID, me, `{"visibility":"public"}`))
		if rr.Code != http.StatusOK {
			t.Fatalf("publish = %d %s", rr.Code, rr.Body)
		}
		other := detail(auth.Identity{ID: "someone-else", Email: "x@example.test"})
		if other.ModelSwitchable || len(other.Models) != 0 || other.DefaultModel != "" {
			t.Fatalf("non-owner catalog leaked: %+v", other)
		}
	})
}
