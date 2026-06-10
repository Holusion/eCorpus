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

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE user_sessions;
