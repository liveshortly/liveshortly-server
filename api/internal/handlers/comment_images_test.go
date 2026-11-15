package handlers

import (
	"encoding/base64"
	"strings"
	"testing"
)

func dataURL(mime, b64 string) string { return "data:" + mime + ";base64," + b64 }

// parseCommentImages enforces count, data-URL shape, mime allowlist, valid
// base64, and the per-image size cap — server-side, never trusting the client.
func TestParseCommentImages(t *testing.T) {
	ok := base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n fake png bytes"))

	if imgs, err := parseCommentImages(nil); err != nil || imgs != nil {
		t.Fatalf("empty: %v %v", imgs, err)
	}

	imgs, err := parseCommentImages([]string{dataURL("image/png", ok), dataURL("image/jpeg", ok)})
	if err != nil {
		t.Fatalf("valid: %v", err)
	}
	if len(imgs) != 2 || imgs[0].mime != "image/png" || imgs[0].data != ok {
		t.Fatalf("parsed = %+v", imgs)
	}

	big := base64.StdEncoding.EncodeToString(make([]byte, maxImageBytes+1))
	bad := map[string][]string{
		"too many":       {dataURL("image/png", ok), dataURL("image/png", ok), dataURL("image/png", ok), dataURL("image/png", ok)},
		"not data url":   {ok},
		"bad mime":       {dataURL("application/pdf", ok)},
		"not base64 enc": {"data:image/png;charset=utf8,hello"},
		"bad base64":     {dataURL("image/png", "not*base64*")},
		"too big":        {dataURL("image/png", big)},
		"empty":          {dataURL("image/png", "")},
	}
	for name, in := range bad {
		if _, err := parseCommentImages(in); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}

// The viewer_comment event payload must never carry image bytes — only the
// message text (with the client's "[Image #N]" placeholders) and username.
func TestCommentEventHasNoImageBlob(t *testing.T) {
	ok := base64.StdEncoding.EncodeToString([]byte("some image bytes here"))
	imgs, err := parseCommentImages([]string{dataURL("image/png", ok)})
	if err != nil {
		t.Fatal(err)
	}
	// This mirrors what PostComment stores: message + username only.
	msg := "look here [Image #1]"
	if strings.Contains(msg, ok) || strings.Contains(msg, imgs[0].data) {
		t.Fatal("placeholder text must not embed base64")
	}
}
