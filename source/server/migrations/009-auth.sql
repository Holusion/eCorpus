--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- Server-side sessions: the cookie only carries an opaque high-entropy "sid";
-- everything else (identity, expiry) is resolved from this table on each
-- request, making sessions revocable and privilege changes immediate.
-- The sid is stored as a sha256 digest so a database leak does not yield
-- usable session credentials. session_id is the management handle exposed by
-- the inventory/revocation API; the credential itself never leaves the cookie.
CREATE TABLE user_sessions (
  session_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sid_hash BYTEA NOT NULL UNIQUE,
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT
);

CREATE INDEX user_sessions_user ON user_sessions(fk_user_id);

-- OAuth2 clients, registered by administrators (no dynamic registration).
-- secret_hash is NULL for public clients (eg. CLIs), which rely on PKCE only.
CREATE TABLE oauth_clients (
  client_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL UNIQUE CHECK(0 < length(name)),
  secret_hash BYTEA,
  redirect_uris TEXT[] NOT NULL,
  created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Opaque API tokens: the credential is "ecorpus_<id>_<secret>", only
-- sha256(secret) is stored. Backs both OAuth2-granted tokens (fk_client_id
-- set; deleting a client revokes everything it minted) and personal access
-- tokens (fk_client_id NULL).
-- scope is a set of scope strings (RFC6749 §3.3). `all` grants everything
-- the owner could do in a session; `scenes:read|write|admin` cap the access
-- level granted on per-scene routes (never their visibility).
CREATE TABLE api_tokens (
  token_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  fk_client_id BIGINT REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(0 < length(name)),
  hash BYTEA NOT NULL,
  scope TEXT[] NOT NULL DEFAULT '{all}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);

CREATE INDEX api_tokens_user ON api_tokens(fk_user_id);

-- Single-use authorization codes (deleted on exchange), stored hashed.
CREATE TABLE oauth_codes (
  code_hash BYTEA PRIMARY KEY,
  fk_client_id BIGINT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  scope TEXT[] NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE oauth_codes;

DROP TABLE api_tokens;

DROP TABLE oauth_clients;

DROP TABLE user_sessions;
