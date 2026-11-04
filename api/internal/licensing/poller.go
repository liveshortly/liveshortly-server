package licensing

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// Poll fetches and verifies the revocation list from url, replaces r's set and
// returns the ids. On any failure nothing changes.
func Poll(ctx context.Context, c *http.Client, url string, v *Verifier, r *Revoked) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("revocation list: HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	ids, err := v.ParseRevoked(body)
	if err != nil {
		return nil, err
	}
	r.set(ids)
	return ids, nil
}

// Run polls now and then every interval until ctx ends, passing each verified
// id list to apply (which marks stored licences revoked). url "" disables it.
func Run(ctx context.Context, url string, interval time.Duration, v *Verifier, r *Revoked, apply func(context.Context, []string) error) {
	if url == "" {
		return
	}
	c := &http.Client{Timeout: 15 * time.Second}
	tick := func() {
		ids, err := Poll(ctx, c, url, v, r)
		if err == nil {
			err = apply(ctx, ids)
		}
		if err != nil {
			log.Printf("licence revocation poll: %v", err)
		}
	}
	tick()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			tick()
		}
	}
}
