--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------


CREATE TABLE groups (
  group_id BIGINT PRIMARY KEY,
  group_name TEXT NOT NULL UNIQUE COLLATE ignore_accent_case CHECK(3 <= length(group_name))
);


CREATE TABLE groups_acl (
  fk_group_id BIGINT NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  fk_scene_id BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  access_level SMALLINT NOT NULL CONSTRAINT valid_access_level CHECK(1 <= access_level AND access_level <= 3),
  UNIQUE(fk_group_id, fk_scene_id)
);


CREATE TABLE groups_membership (
  fk_group_id BIGINT NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE(fk_group_id, fk_user_id)
);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE groups_acl;

DROP TABLE groups_membership;

DROP TABLE groups;
