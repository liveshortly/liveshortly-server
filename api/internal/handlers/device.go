package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"html"
	"net/http"
	"net/url"
	"strings"
	"time"

	"liveshortly/internal/httpx"
	"liveshortly/internal/websession"
)

// deviceTTL bounds the whole device-flow lifetime.
const deviceTTL = 10 * time.Minute

// userCodeAlphabet excludes visually ambiguous characters (0/O, 1/I).
const userCodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

// deviceRecord is the JSON value stored in Redis under device:{code}.
type deviceRecord struct {
	UserCode string `json:"user_code"`
	Status   string `json:"status"` // pending | approved
	UserID   string `json:"user_id"`
}

// DeviceStart issues a device_code + user_code pair for the CLI login flow.
// POST /auth/device/start.
func (g *GoogleAuth) DeviceStart(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	deviceCode, err := randomHex(32)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start device flow")
		return
	}
	userCode, err := randomUserCode()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start device flow")
		return
	}

	rec, _ := json.Marshal(deviceRecord{UserCode: userCode, Status: "pending"})
	if err := g.bus.DeviceSet(ctx, deviceCode, string(rec), deviceTTL); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start device flow")
		return
	}
	if err := g.bus.UserCodeSet(ctx, userCode, deviceCode, deviceTTL); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to start device flow")
		return
	}

	base := strings.TrimRight(g.cfg.WebBaseURL, "/")
	httpx.JSON(w, http.StatusOK, map[string]any{
		"device_code":               deviceCode,
		"user_code":                 userCode,
		"verification_uri":          base + "/device",
		"verification_uri_complete": base + "/device?code=" + userCode,
		"interval":                  5,
		"expires_in":                int(deviceTTL.Seconds()),
	})
}

// DevicePage renders the approval page. If the visitor is not logged in it
// bounces through Google login and comes back here. GET /device?code=USER_CODE.
func (g *GoogleAuth) DevicePage(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))

	claims, ok := g.mgr.WebUserFromRequest(r)
	if !ok {
		next := "/device?code=" + url.QueryEscape(code)
		http.Redirect(w, r, "/auth/google/login?next="+url.QueryEscape(next), http.StatusFound)
		return
	}

	writeHTML(w, http.StatusOK, devicePageHTML(code, claims.Email))
}

// DeviceApprove binds the approved device to the logged-in user.
// POST /auth/device/approve (cookie-authed; form or JSON {user_code}).
func (g *GoogleAuth) DeviceApprove(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	claims, ok := g.mgr.WebUserFromRequest(r)
	if !ok {
		httpx.JSON(w, http.StatusUnauthorized, map[string]any{"authenticated": false})
		return
	}

	jsonClient := strings.Contains(r.Header.Get("Content-Type"), "application/json")
	userCode := ""
	if jsonClient {
		var body struct {
			UserCode string `json:"user_code"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		userCode = body.UserCode
	} else {
		_ = r.ParseForm()
		userCode = r.FormValue("user_code")
	}
	userCode = strings.ToUpper(strings.TrimSpace(userCode))
	if userCode == "" {
		g.approveError(w, jsonClient, "missing user_code")
		return
	}

	deviceCode, ok, err := g.bus.UserCodeGet(ctx, userCode)
	if err != nil {
		g.approveError(w, jsonClient, "internal error")
		return
	}
	if !ok {
		g.approveError(w, jsonClient, "code expired or invalid")
		return
	}

	raw, ok, err := g.bus.DeviceGet(ctx, deviceCode)
	if err != nil || !ok {
		g.approveError(w, jsonClient, "code expired or invalid")
		return
	}
	var rec deviceRecord
	if err := json.Unmarshal([]byte(raw), &rec); err != nil {
		g.approveError(w, jsonClient, "code expired or invalid")
		return
	}

	rec.Status = "approved"
	rec.UserID = claims.UserID
	updated, _ := json.Marshal(rec)
	if err := g.bus.DeviceUpdate(ctx, deviceCode, string(updated)); err != nil {
		g.approveError(w, jsonClient, "internal error")
		return
	}

	if jsonClient {
		httpx.JSON(w, http.StatusOK, map[string]any{"status": "approved"})
		return
	}
	writeHTML(w, http.StatusOK, approvedHTML(claims.Email))
}

type devicePollReq struct {
	DeviceCode string `json:"device_code"`
}

// DevicePoll is polled by the CLI: pending until approved, then it mints and
// returns the tokens and consumes the code. POST /auth/device/poll.
func (g *GoogleAuth) DevicePoll(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req devicePollReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.DeviceCode == "" {
		httpx.Error(w, http.StatusBadRequest, "device_code is required")
		return
	}

	raw, ok, err := g.bus.DeviceGet(ctx, req.DeviceCode)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "expired")
		return
	}
	var rec deviceRecord
	if err := json.Unmarshal([]byte(raw), &rec); err != nil {
		httpx.Error(w, http.StatusBadRequest, "expired")
		return
	}
	if rec.Status != "approved" {
		httpx.JSON(w, http.StatusOK, map[string]any{"status": "pending"})
		return
	}

	u, err := g.store.GetUserByID(ctx, rec.UserID)
	if err != nil || u == nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	access, err := g.mgr.MintAccess(websession.TokenUser{ID: u.ID, Email: u.Email, Name: u.Name})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to mint token")
		return
	}
	rawRefresh, hash, err := websession.GenerateRefreshToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to mint token")
		return
	}
	if _, err := g.store.InsertRefreshToken(ctx, u.ID, hash, "cli device"); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to store token")
		return
	}

	// Issuing tokens counts as a login: resolve any pending email grants.
	_ = g.store.ResolvePendingShares(ctx, u.Email, u.ID)

	// Consume the device flow.
	_ = g.bus.DeviceDelete(ctx, req.DeviceCode, rec.UserCode)

	httpx.JSON(w, http.StatusOK, map[string]any{
		"access_token":  access,
		"refresh_token": rawRefresh,
		"expires_in":    g.mgr.AccessTTLSeconds(),
		"token_type":    "Bearer",
		"user":          map[string]string{"email": u.Email, "name": u.Name},
	})
}

func (g *GoogleAuth) approveError(w http.ResponseWriter, jsonClient bool, msg string) {
	if jsonClient {
		httpx.Error(w, http.StatusBadRequest, msg)
		return
	}
	writeHTML(w, http.StatusBadRequest, messageHTML("✗ "+msg))
}

// --- token/code generation --------------------------------------------------

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// randomUserCode returns an unambiguous "XXXX-XXXX" code.
func randomUserCode() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	chars := make([]byte, 8)
	for i := range chars {
		chars[i] = userCodeAlphabet[int(b[i])%len(userCodeAlphabet)]
	}
	return string(chars[:4]) + "-" + string(chars[4:]), nil
}

// --- HTML (inline, terminal-HUD light) --------------------------------------

func writeHTML(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

const htmlHead = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LiveShortly · Device</title>
<style>
  :root{--bg:#f3f1e9;--panel:#faf9f4;--line:#d9d6c9;--ink:#1a1916;--muted:#6c6a5e;--green:#1f7a4d;--red:#c0392b}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:'JetBrains Mono','IBM Plex Mono',ui-monospace,Menlo,monospace;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .panel{background:var(--panel);border:1px solid var(--line);max-width:460px;width:100%;padding:28px 26px}
  .label{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:var(--muted);margin-bottom:14px}
  h1{font-size:18px;margin:0 0 6px}
  p{font-size:13px;line-height:1.5;color:var(--ink)}
  .code{font-size:22px;letter-spacing:.18em;border:1px dashed var(--line);padding:10px 14px;display:inline-block;margin:8px 0}
  .email{color:var(--green)}
  button{font:inherit;background:var(--ink);color:var(--bg);border:1px solid var(--ink);padding:10px 18px;cursor:pointer;
         text-transform:uppercase;letter-spacing:.1em;font-size:12px;margin-top:14px}
  button:hover{background:#000}
  .ok{color:var(--green);font-size:16px}
  .err{color:var(--red);font-size:15px}
</style></head><body><div class="panel">`

const htmlFoot = `</div></body></html>`

func devicePageHTML(code, email string) string {
	return htmlHead +
		`<div class="label">LiveShortly · CLI Access</div>` +
		`<h1>Approve CLI access?</h1>` +
		`<p>Authorize the LiveShortly CLI for <span class="email">` + html.EscapeString(email) + `</span>.</p>` +
		`<div class="code">` + html.EscapeString(code) + `</div>` +
		`<form method="post" action="/auth/device/approve">` +
		`<input type="hidden" name="user_code" value="` + html.EscapeString(code) + `">` +
		`<button type="submit">Approve</button>` +
		`</form>` + htmlFoot
}

func approvedHTML(email string) string {
	return htmlHead +
		`<div class="label">LiveShortly · CLI Access</div>` +
		`<p class="ok">✓ Approved — return to your terminal.</p>` +
		`<p>Signed in as <span class="email">` + html.EscapeString(email) + `</span>.</p>` +
		htmlFoot
}

func messageHTML(msg string) string {
	return htmlHead + `<p class="err">` + html.EscapeString(msg) + `</p>` + htmlFoot
}
