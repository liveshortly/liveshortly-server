package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net"
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
	Status   string `json:"status"` // pending | approved | denied
	UserID   string `json:"user_id"`

	// Request details shown on the approval page so the user can tell
	// whether this request is theirs. Display only — never trusted.
	DeviceName string `json:"device_name,omitempty"`
	OS         string `json:"os,omitempty"`
	UserAgent  string `json:"user_agent,omitempty"`
	IP         string `json:"ip,omitempty"`
	Country    string `json:"country,omitempty"`
	CreatedAt  int64  `json:"created_at,omitempty"`
}

// DeviceStart issues a device_code + user_code pair for the CLI login flow.
// POST /auth/device/start, optional JSON {device_name, os}.
func (g *GoogleAuth) DeviceStart(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var body struct {
		DeviceName string `json:"device_name"`
		OS         string `json:"os"`
	}
	_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)

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

	rec, _ := json.Marshal(deviceRecord{
		UserCode:   userCode,
		Status:     "pending",
		DeviceName: clip(body.DeviceName, 64),
		OS:         clip(body.OS, 64),
		UserAgent:  clip(r.UserAgent(), 160),
		IP:         clientIP(r),
		Country:    clip(r.Header.Get("CF-IPCountry"), 8),
		CreatedAt:  time.Now().Unix(),
	})
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
// bounces through Google login and comes back here. GET /device[?code=USER_CODE].
// Without a code it asks the user to type the one shown in their terminal.
func (g *GoogleAuth) DevicePage(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("code"))

	claims, ok := g.mgr.WebUserFromRequest(r)
	if !ok {
		next := "/device"
		if raw != "" {
			next += "?code=" + url.QueryEscape(raw)
		}
		http.Redirect(w, r, "/auth/google/login?next="+url.QueryEscape(next), http.StatusFound)
		return
	}

	if raw == "" {
		writeHTML(w, http.StatusOK, codeEntryHTML(""))
		return
	}
	code := normalizeUserCode(raw)
	_, rec, found, err := g.lookupDevice(r.Context(), code)
	if err != nil {
		writeHTML(w, http.StatusInternalServerError, messageHTML("Something went wrong", "Please try again in a moment."))
		return
	}
	if !found || rec.Status != "pending" {
		writeHTML(w, http.StatusNotFound, codeEntryHTML("That code is expired, already used, or invalid. Run `live login` again and enter the new code."))
		return
	}
	writeHTML(w, http.StatusOK, devicePageHTML(code, claims.Email, rec))
}

// DeviceApprove binds the approved device to the logged-in user.
// POST /auth/device/approve (cookie-authed; form or JSON {user_code}).
func (g *GoogleAuth) DeviceApprove(w http.ResponseWriter, r *http.Request) {
	g.deviceDecide(w, r, "approved")
}

// DeviceDeny rejects a pending device login; the CLI's next poll fails.
// POST /auth/device/deny (cookie-authed; form or JSON {user_code}).
func (g *GoogleAuth) DeviceDeny(w http.ResponseWriter, r *http.Request) {
	g.deviceDecide(w, r, "denied")
}

func (g *GoogleAuth) deviceDecide(w http.ResponseWriter, r *http.Request, status string) {
	ctx := r.Context()

	claims, ok := g.mgr.WebUserFromRequest(r)
	if !ok {
		httpx.JSON(w, http.StatusUnauthorized, map[string]any{"authenticated": false})
		return
	}

	jsonClient := strings.Contains(r.Header.Get("Content-Type"), "application/json")
	// Defense in depth on top of the SameSite=Lax session cookie: a browser
	// POST from another site carries its Origin, so refuse it.
	if !g.sameOrigin(r) {
		g.deviceError(w, jsonClient, http.StatusForbidden, "cross-origin request refused")
		return
	}

	userCode := ""
	if jsonClient {
		var body struct {
			UserCode string `json:"user_code"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&body)
		userCode = body.UserCode
	} else {
		_ = r.ParseForm()
		userCode = r.FormValue("user_code")
	}
	if strings.TrimSpace(userCode) == "" {
		g.deviceError(w, jsonClient, http.StatusBadRequest, "missing user_code")
		return
	}

	deviceCode, rec, found, err := g.lookupDevice(ctx, normalizeUserCode(userCode))
	if err != nil {
		g.deviceError(w, jsonClient, http.StatusInternalServerError, "internal error")
		return
	}
	if !found {
		g.deviceError(w, jsonClient, http.StatusBadRequest, "code expired or invalid")
		return
	}
	// A code is decided exactly once: no re-binding an approved device to
	// another account, no flipping a denial.
	if rec.Status != "pending" {
		g.deviceError(w, jsonClient, http.StatusConflict, "code already used")
		return
	}

	rec.Status = status
	if status == "approved" {
		rec.UserID = claims.UserID
	}
	updated, _ := json.Marshal(rec)
	if err := g.bus.DeviceUpdate(ctx, deviceCode, string(updated)); err != nil {
		g.deviceError(w, jsonClient, http.StatusInternalServerError, "internal error")
		return
	}

	if jsonClient {
		httpx.JSON(w, http.StatusOK, map[string]any{"status": status})
		return
	}
	if status == "approved" {
		writeHTML(w, http.StatusOK, approvedHTML(claims.Email))
		return
	}
	writeHTML(w, http.StatusOK, messageHTML("Request denied",
		"The CLI was not signed in. If you didn't start this login, nothing else is needed."))
}

// lookupDevice resolves a normalized user_code to its device record.
func (g *GoogleAuth) lookupDevice(ctx context.Context, userCode string) (string, deviceRecord, bool, error) {
	var rec deviceRecord
	if userCode == "" {
		return "", rec, false, nil
	}
	deviceCode, ok, err := g.bus.UserCodeGet(ctx, userCode)
	if err != nil || !ok {
		return "", rec, false, err
	}
	raw, ok, err := g.bus.DeviceGet(ctx, deviceCode)
	if err != nil || !ok {
		return "", rec, false, err
	}
	if err := json.Unmarshal([]byte(raw), &rec); err != nil {
		return "", rec, false, nil
	}
	return deviceCode, rec, true, nil
}

// sameOrigin allows requests with no Origin (native clients, old browsers;
// the SameSite cookie still covers those) or an Origin whose host is this
// server or one of its configured web hosts.
func (g *GoogleAuth) sameOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}
	if b, err := url.Parse(g.cfg.WebBaseURL); err == nil && strings.EqualFold(u.Host, b.Host) {
		return true
	}
	for _, h := range g.cfg.OAuthAllowedHosts {
		if strings.EqualFold(u.Host, h) {
			return true
		}
	}
	return false
}

type devicePollReq struct {
	DeviceCode string `json:"device_code"`
}

// DevicePoll is polled by the CLI: pending until approved, then it mints and
// returns the tokens and consumes the code. A denied code returns 403
// access_denied (and is consumed). POST /auth/device/poll.
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
	if rec.Status == "denied" {
		_ = g.bus.DeviceDelete(ctx, req.DeviceCode, rec.UserCode)
		httpx.Error(w, http.StatusForbidden, "access_denied")
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

	rawRefresh, hash, err := websession.GenerateRefreshToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to mint token")
		return
	}
	// Label the token with what the CLI said it is, so settings can name it.
	label := "cli device"
	if rec.DeviceName != "" {
		label = rec.DeviceName
		if rec.OS != "" {
			label += " (" + rec.OS + ")"
		}
	}
	rtID, err := g.store.InsertRefreshToken(ctx, u.ID, hash, label)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to store token")
		return
	}
	access, err := g.mgr.MintAccess(websession.TokenUser{ID: u.ID, Email: u.Email, Name: u.Name, SessionID: rtID})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to mint token")
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

func (g *GoogleAuth) deviceError(w http.ResponseWriter, jsonClient bool, status int, msg string) {
	if jsonClient {
		httpx.Error(w, status, msg)
		return
	}
	hint := "Run `live login` again to get a new code."
	if status == http.StatusInternalServerError {
		hint = "Please try again in a moment."
	}
	writeHTML(w, status, messageHTML("✗ "+msg, hint))
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

// normalizeUserCode accepts a typed code in any case, with or without the
// dash or spaces, and returns the canonical "XXXX-XXXX" — or "" if it can't
// be a valid code.
func normalizeUserCode(s string) string {
	s = strings.ToUpper(s)
	s = strings.NewReplacer("-", "", " ", "").Replace(s)
	if len(s) != 8 {
		return ""
	}
	for _, c := range s {
		if !strings.ContainsRune(userCodeAlphabet, c) {
			return ""
		}
	}
	return s[:4] + "-" + s[4:]
}

// clientIP is the caller's address as nginx reports it (X-Real-IP), else the
// socket peer. Display only.
func clientIP(r *http.Request) string {
	if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
		return clip(ip, 64)
	}
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return clip(r.RemoteAddr, 64)
}

// --- HTML (inline, LiveShortly tokens, light + dark) ------------------------

func writeHTML(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Frame-Options", "DENY") // no clickjacking the Approve button
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

// The palette mirrors the web app's token names/values (web/app/globals.css)
// so this server-rendered page matches the app in both themes. The init
// script honours the app's saved theme (localStorage "ls-theme", default dark).
const htmlHead = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>LiveShortly · Sign in to the CLI</title>
<script>(function(){try{var m=localStorage.getItem('ls-theme');var d=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var t=(m==='light'||m==='dark')?m:(m==='system'?(d?'dark':'light'):'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
<style>
  :root,:root[data-theme="light"]{--bg:#e7e8ea;--panel:#f3f4f5;--panel2:#fff;--hairline:#d0d2d5;--strong:#1b1c1e;
    --ink:#1b1c1e;--muted:#63666b;--faint:#94979c;--green:#1f7a4d;--red:#c0392b;color-scheme:light}
  :root[data-theme="dark"]{--bg:#1e2123;--panel:#282c2f;--panel2:#2d3236;--hairline:#3d4247;--strong:#edeff1;
    --ink:#e9ebed;--muted:#a6abb1;--faint:#797f86;--green:#54b885;--red:#e7705f;color-scheme:dark}
  @media (prefers-color-scheme:dark){:root:not([data-theme]){--bg:#1e2123;--panel:#282c2f;--panel2:#2d3236;--hairline:#3d4247;
    --strong:#edeff1;--ink:#e9ebed;--muted:#a6abb1;--faint:#797f86;--green:#54b885;--red:#e7705f;color-scheme:dark}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:"JetBrains Mono","IBM Plex Mono",ui-monospace,"SFMono-Regular",Menlo,monospace;
       line-height:1.45;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px}
  .panel{background:var(--panel);border:1px solid var(--hairline);border-radius:10px;max-width:460px;width:100%;padding:28px 26px}
  .brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:14px;margin-bottom:22px}
  .brand svg{flex:none}
  h1{font-size:18px;margin:0 0 10px}
  p{font-size:13px;margin:0 0 12px;color:var(--ink)}
  .muted{color:var(--muted)}
  .code{font-size:28px;font-weight:600;letter-spacing:.16em;text-align:center;background:var(--panel2);border:1px dashed var(--hairline);
        border-radius:8px;padding:14px 10px;margin:6px 0 18px}
  dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12px;margin:0 0 20px;padding:12px 14px;border:1px solid var(--hairline);border-radius:8px}
  dt{color:var(--muted)} dd{margin:0;overflow-wrap:anywhere}
  .email{color:var(--green)}
  .actions{display:flex;gap:10px;flex-wrap:wrap}
  button{font:inherit;font-size:13px;font-weight:600;padding:10px 18px;border-radius:6px;cursor:pointer;border:1px solid transparent}
  button:focus-visible,input:focus-visible{outline:2px solid var(--green);outline-offset:2px}
  .approve{background:var(--green);color:var(--panel);flex:1}
  .deny{background:transparent;color:var(--red);border-color:var(--red)}
  .approve:hover{filter:brightness(1.08)} .deny:hover{background:color-mix(in srgb,var(--red) 10%,transparent)}
  label{display:block;font-size:13px;margin-bottom:8px}
  input{font:inherit;font-size:20px;letter-spacing:.14em;text-transform:uppercase;width:100%;padding:10px 12px;margin-bottom:14px;
        background:var(--panel2);color:var(--ink);border:1px solid var(--hairline);border-radius:6px}
  .ok{color:var(--green);font-size:16px;font-weight:600}
  .err{color:var(--red);font-size:15px;font-weight:600}
  code{background:var(--panel2);border:1px solid var(--hairline);border-radius:4px;padding:1px 5px}
</style></head><body><main class="panel">
<div class="brand"><svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="6" fill="var(--green)"/><rect x="7" y="8.5" width="6.5" height="15" rx="1.5" fill="#faf9f4"/><rect x="16.5" y="8.5" width="8.5" height="15" rx="1.5" fill="var(--green)" stroke="#faf9f4" stroke-width="2"/></svg>LiveShortly</div>`

const htmlFoot = `</main></body></html>`

// withCode renders `live login` style backticks in trusted copy as <code>.
func withCode(s string) string {
	parts := strings.Split(html.EscapeString(s), "`")
	for i := 1; i < len(parts); i += 2 {
		parts[i] = "<code>" + parts[i] + "</code>"
	}
	return strings.Join(parts, "")
}

func devicePageHTML(code, email string, rec deviceRecord) string {
	row := func(k, v string) string {
		if v == "" {
			return ""
		}
		return `<dt>` + k + `</dt><dd>` + html.EscapeString(v) + `</dd>`
	}
	device := rec.DeviceName
	if device == "" {
		device = rec.UserAgent
	}
	ip := rec.IP
	if rec.Country != "" && ip != "" {
		ip += " (" + rec.Country + ")"
	}
	when := ""
	if rec.CreatedAt > 0 {
		t := time.Unix(rec.CreatedAt, 0).UTC()
		left := max(0, int(time.Until(t.Add(deviceTTL)).Minutes()+0.5))
		when = fmt.Sprintf("%s UTC · expires in %d min", t.Format("Jan 2, 15:04"), left)
	}
	esc := html.EscapeString(code)
	return htmlHead +
		`<h1>Sign in to the LiveShortly CLI</h1>` +
		`<p class="muted">Check that this code matches your terminal:</p>` +
		`<div class="code">` + esc + `</div>` +
		`<dl>` + row("Account", email) + row("Device", device) + row("OS", rec.OS) +
		row("IP", ip) + row("Requested", when) + `</dl>` +
		`<p class="muted">Only approve if you just ran <code>live login</code> and the code matches.</p>` +
		`<form method="post" action="/auth/device/approve" class="actions">` +
		`<input type="hidden" name="user_code" value="` + esc + `">` +
		`<button type="submit" class="approve">Approve</button>` +
		`<button type="submit" class="deny" formaction="/auth/device/deny">Deny</button>` +
		`</form>` + htmlFoot
}

// codeEntryHTML is shown when /device is opened without a (usable) code.
func codeEntryHTML(errMsg string) string {
	e := ""
	if errMsg != "" {
		e = `<p class="err" role="alert">` + withCode(errMsg) + `</p>`
	}
	return htmlHead +
		`<h1>Sign in to the LiveShortly CLI</h1>` + e +
		`<form method="get" action="/device">` +
		`<label for="code">Enter the code shown in your terminal</label>` +
		`<input id="code" name="code" required autofocus autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="XXXX-XXXX">` +
		`<div class="actions"><button type="submit" class="approve">Continue</button></div>` +
		`</form>` + htmlFoot
}

func approvedHTML(email string) string {
	return htmlHead +
		`<p class="ok">✓ Approved</p>` +
		`<p>You can close this tab and return to your terminal.</p>` +
		`<p class="muted">Signed in as <span class="email">` + html.EscapeString(email) + `</span>.</p>` +
		htmlFoot
}

func messageHTML(title, detail string) string {
	return htmlHead + `<p class="err">` + html.EscapeString(title) + `</p><p class="muted">` + withCode(detail) + `</p>` + htmlFoot
}
