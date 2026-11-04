-- pocket-licenses schema (COM-05 v2 / COM-06)
CREATE TABLE licenses (
  id TEXT PRIMARY KEY,                 -- uuid, also payload.license.id
  key TEXT NOT NULL,                   -- full signed key/<payload>.<sig>
  email TEXT NOT NULL,                 -- lowercased
  product TEXT NOT NULL,               -- pocketai-mac | ls-pro
  provider TEXT NOT NULL,              -- dodo | manual
  provider_payment_id TEXT,            -- Dodo payment_id; NULL for manual keys
  created TEXT NOT NULL,               -- ISO 8601 UTC
  expiry TEXT,                         -- ISO 8601 UTC or NULL (perpetual)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'refunded', 'revoked')),
  UNIQUE (provider, provider_payment_id, product)   -- one key per product per payment (replay-safe)
);
CREATE INDEX licenses_email ON licenses (email);
CREATE INDEX licenses_payment ON licenses (provider_payment_id);

-- webhook idempotency: Standard Webhooks `webhook-id`
CREATE TABLE events (
  provider_event_id TEXT PRIMARY KEY,
  received TEXT NOT NULL
);

-- device cap (COM-06); schema only for now
CREATE TABLE activations (
  license_id TEXT NOT NULL REFERENCES licenses (id),
  device_id TEXT NOT NULL,
  name TEXT,
  platform TEXT,
  created TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  PRIMARY KEY (license_id, device_id)
);

-- POST /resend rate limiting; subject = 'email:<addr>' or 'ip:<addr>', at = unix seconds
CREATE TABLE resends (
  subject TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX resends_subject_at ON resends (subject, at);
