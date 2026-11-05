-- COM-13: contact list, email failure counter, /forget confirmation tokens. Additive only.
CREATE TABLE contacts (
  email TEXT PRIMARY KEY,              -- lowercased
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  source TEXT NOT NULL,                -- mac-app | site-licence | dodo-purchase | manual
  product TEXT,
  marketing_optin INTEGER NOT NULL DEFAULT 0,
  optin_at TEXT,
  unsubscribed_at TEXT
);
CREATE TABLE email_failures (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  count INTEGER NOT NULL DEFAULT 0,
  last_at TEXT
);
INSERT INTO email_failures (id, count) VALUES (1, 0);
CREATE TABLE forget_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires INTEGER NOT NULL             -- unix seconds
);
