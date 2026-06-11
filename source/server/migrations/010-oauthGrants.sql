--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- Persisted OAuth2 consent: once a user has approved a client for a scope set,
-- the authorize endpoint re-issues codes silently (no consent page) as long as
-- the user holds an authenticated session and the requested scope is covered.
-- Deleting the row (the "authorized applications" UI) stops silent renewal and
-- is paired with revocation of the tokens the client obtained for that user.
-- scope is the union of every scope set the user has approved for the client.
CREATE TABLE oauth_grants (
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  fk_client_id BIGINT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  scope TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fk_user_id, fk_client_id)
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE oauth_grants;
