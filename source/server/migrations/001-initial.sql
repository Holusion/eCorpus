--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------
CREATE COLLATION ignore_accent_case (provider = icu, deterministic = false, locale = 'und-u-ks-level1');

CREATE TABLE users (
  user_id BIGINT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE ignore_accent_case CHECK(3 <= length(username)),
  email TEXT UNIQUE,
  password CHAR(133),
  level SMALLINT NOT NULL DEFAULT 1 CHECK(1 <= level AND level <= 4),
  first_name TEXT,
  last_name TEXT,
  uri TEXT
);

CREATE INDEX usernames ON users(username);


CREATE TABLE keys (
  key_id SERIAL PRIMARY KEY,
  key_data BYTEA NOT NULL 
);

CREATE TABLE config (
  name TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE scenes (
  scene_id BIGINT PRIMARY KEY,
  scene_name TEXT NOT NULL UNIQUE,
  ctime TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fk_author_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  archived TIMESTAMPTZ DEFAULT NULL,
  public_access SMALLINT NOT NULL DEFAULT 1 CONSTRAINT public_access_allowed_values CHECK(0 <= public_access AND public_access <= 1 AND public_access <= default_access),
  default_access SMALLINT NOT NULL DEFAULT 1 CONSTRAINT default_access_allowed_values CHECK(0 <= default_access AND default_access <= 2)
);

CREATE INDEX archived_scenes ON scenes(scene_id, archived);

CREATE TABLE users_acl(
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  fk_scene_id BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  access_level SMALLINT NOT NULL CONSTRAINT valid_access_level CHECK(1 <= access_level AND access_level <= 3),
  UNIQUE(fk_user_id, fk_scene_id)
);

CREATE TABLE files (
  file_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  generation INTEGER NOT NULL DEFAULT 1,
  hash VARCHAR(43),
  ctime TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  size BIGINT NOT NULL DEFAULT 0,
  fk_author_id BIGINT,
  fk_scene_id BIGINT NOT NULL,
  data TEXT DEFAULT NULL,
  FOREIGN KEY(fk_scene_id) REFERENCES scenes(scene_id) ON DELETE CASCADE,
  FOREIGN KEY(fk_author_id) REFERENCES users(user_id)  ON DELETE SET NULL,
  UNIQUE(fk_scene_id, name, generation)
);

CREATE INDEX files_path ON files(fk_scene_id, name);
CREATE INDEX files_mime ON files(fk_scene_id, mime);

CREATE FUNCTION ensure_parent_folder_exists() RETURNS TRIGGER AS $$
  BEGIN
    IF (SELECT COUNT(name) FROM files WHERE files.mime = 'text/directory' AND NEW.name LIKE files.name || '/%') < 1 THEN
      RAISE EXCEPTION 'ENOENT: no such directory';
    END IF;
    RETURN NULL;
  END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER file_has_parent_folder AFTER INSERT
ON files
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.name LIKE '%_/_%')
EXECUTE FUNCTION ensure_parent_folder_exists();


CREATE FUNCTION delete_folder_content() RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO files (
      name,
      mime,
      generation,
      hash,
      size,
      fk_author_id,
      fk_scene_id
    ) SELECT
      name,
      'application/octet-stream' AS mime,
      generation + 1 AS generation,
      NULL AS hash,
      '0' AS size,
      NEW.fk_author_id AS fk_author_id,
      files.fk_scene_id AS fk_scene_id
    FROM files
    WHERE fk_scene_id = NEW.fk_scene_id AND name LIKE NEW.name || '/%';
    RETURN NULL;
  END
$$ LANGUAGE plpgsql;


-- delete contents of a folder when it is deleted
CREATE TRIGGER delete_folder AFTER INSERT ON files
FOR EACH ROW 
WHEN (NEW.mime = 'text/directory' AND NEW.hash IS NULL)
EXECUTE FUNCTION delete_folder_content();


CREATE TABLE tags(
  tag_name TEXT NOT NULL,
  fk_scene_id BIGINT NOT NULL,
  FOREIGN KEY(fk_scene_id) REFERENCES scenes(scene_id) ON DELETE CASCADE,
  UNIQUE(tag_name, fk_scene_id)
);


CREATE FUNCTION create_default_folders_for_scene() RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO files (
      name,
      mime,
      generation,
      hash,
      size,
      fk_author_id,
      fk_scene_id
    ) VALUES
    ('articles', 'text/directory', 1, 'directory', 0 , NEW.fk_author_id, NEW.scene_id),
    ('models', 'text/directory', 1, 'directory', 0 , NEW.fk_author_id, NEW.scene_id);
    RETURN NULL;
  END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_scene_default_folders AFTER INSERT ON scenes
FOR EACH ROW
EXECUTE FUNCTION create_default_folders_for_scene();

-- designed for internal use only, to compute current_files faster
CREATE TABLE current_generations(
  fk_scene_id BIGINT NOT NULL, -- not REFERENCES because triggers on files will keep track of this
  name TEXT NOT NULL,
  generation INTEGER NOT NULL,
  PRIMARY KEY (fk_scene_id, name),
  FOREIGN KEY (fk_scene_id, name, generation) REFERENCES files(fk_scene_id, name, generation) ON DELETE CASCADE
);

CREATE FUNCTION update_current_generation() RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO current_generations (
      fk_scene_id,
      name,
      generation
    ) 
    VALUES (NEW.fk_scene_id, NEW.name, NEW.generation)
    ON CONFLICT (fk_scene_id, name) DO UPDATE SET generation = EXCLUDED.generation;
    RETURN NULL;
  END
$$ LANGUAGE plpgsql;

-- files has just been created so it's a noop ipso facto
-- However we keep it here for reference if we ever need to backfill generations
INSERT INTO current_generations (
    fk_scene_id,
    name,
    generation
  ) 
SELECT 
  fk_scene_id,
  name,
  last.generation
FROM (
  SELECT fk_scene_id, name, MAX(generation) as generation 
  FROM files
  GROUP BY fk_scene_id, name) AS last
INNER JOIN files USING(fk_scene_id, name, generation);


-- delete contents of a folder when it is deleted
CREATE TRIGGER on_file_insert AFTER INSERT ON files
FOR EACH ROW 
EXECUTE FUNCTION update_current_generation();


CREATE VIEW current_files AS
  SELECT
    files.file_id,
    files.name,
    files.mime,
    current_generations.generation,
    files.ctime,
    files.hash,
    files.size,
    files.data,
    files.fk_author_id,
    files.fk_scene_id
  FROM current_generations 
  INNER JOIN files USING(fk_scene_id, name, generation)
;


--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

-- triggers and indexes are dropped when tables are dropped 

DROP TABLE current_generations;

DROP VIEW current_files;

DROP TABLE keys CASCADE;

DROP TABLE config CASCADE;

DROP TABLE tags CASCADE;

DROP TABLE files CASCADE;

DROP TABLE scenes CASCADE;

DROP TABLE users_acl CASCADE;

DROP TABLE users CASCADE;


-- drop now unused functions
DROP FUNCTION ensure_parent_folder_exists;
DROP FUNCTION create_default_folders_for_scene;
DROP FUNCTION delete_folder_content;

DROP FUNCTION on_file_insert;

DROP COLLATION ignore_accent_case;
