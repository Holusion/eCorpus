CREATE TABLE IF NOT EXISTS "migrations" (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL,
  up   TEXT    NOT NULL,
  down TEXT    NOT NULL
);
CREATE TABLE users (
  user_id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK(3 <= length(username)),
  email TEXT UNIQUE,
  password TEXT,
  isAdministrator INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX usernames ON users(username);
CREATE TABLE keys (
  key_id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_data BLOB NOT NULL 
);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE config (
  name TEXT PRIMARY KEY,
  value BLOB
);
CREATE TABLE IF NOT EXISTS "files" (
  file_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT "application/octet-stream",
  generation INTEGER DEFAULT 1,
  hash BLOB,
  ctime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  size INTEGER NOT NULL DEFAULT 0,
  fk_author_id INTEGER NOT NULL,
  fk_scene_id INTEGER NOT NULL, data TEXT DEFAULT NULL,
  FOREIGN KEY(fk_scene_id) REFERENCES scenes(scene_id),
  FOREIGN KEY(fk_author_id) REFERENCES users(user_id),
  UNIQUE(fk_scene_id, name, generation)
);
CREATE TRIGGER has_folder BEFORE INSERT ON files
WHEN NEW.name LIKE '%_/_%' AND NOT EXISTS (SELECT name FROM files WHERE files.mime = 'text/directory' AND NEW.name LIKE files.name || '/%')
BEGIN
  SELECT RAISE(ROLLBACK, "ENOENT: no such directory");
END;
CREATE TRIGGER delete_folder AFTER INSERT ON files
WHEN NEW.mime = 'text/directory' AND NEW.hash IS NULL
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
END;
CREATE INDEX files_path ON files(fk_scene_id, name);
CREATE TABLE sqlite_stat1(tbl,idx,stat);
CREATE TABLE tags(
  tag_name TEXT NOT NULL COLLATE NOCASE,
  fk_scene_id INTEGER NOT NULL,
  FOREIGN KEY(fk_scene_id) REFERENCES scenes(scene_id),
  UNIQUE(tag_name, fk_scene_id)
);
CREATE TABLE IF NOT EXISTS "scenes" (
  scene_id INTEGER PRIMARY KEY,
  scene_name TEXT NOT NULL UNIQUE,
  ctime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  access TEXT DEFAULT '{"0":"read"}' CHECK(json_valid(access)),
  fk_author_id INTEGER NOT NULL DEFAULT 0, archived INTEGER DEFAULT 0,
  FOREIGN KEY(fk_author_id) REFERENCES users(user_id)
);
CREATE INDEX files_mime ON files(fk_scene_id, mime);
CREATE TRIGGER delete_user AFTER DELETE ON users
BEGIN
  UPDATE files SET fk_author_id = 0 WHERE fk_author_id = OLD.user_id;
  UPDATE scenes SET fk_author_id = 0 WHERE fk_author_id = OLD.user_id;
  UPDATE scenes SET access = json_remove(access, '$.' || OLD.user_id) WHERE json_extract(access,'$.' || OLD.user_id) NOT NULL;
END;
CREATE TRIGGER delete_scene AFTER DELETE ON scenes
BEGIN
  DELETE FROM files WHERE fk_scene_id = OLD.scene_id;
  DELETE FROM tags WHERE fk_scene_id = OLD.scene_id;
END;
CREATE TRIGGER default_folders AFTER INSERT ON scenes
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
  ('articles', 'text/directory', 1, 'directory', 0 , 0, NEW.scene_id),
  ('models', 'text/directory', 1, 'directory', 0 , 0, NEW.scene_id);
END;
CREATE VIEW current_files AS
  SELECT 
    files.*
  FROM 
    (
      SELECT
        MAX(generation) as generation,
        name,
        fk_scene_id
      FROM files
      GROUP BY name, fk_scene_id
    ) AS gen,
    files USING(generation, name, fk_scene_id)
/* current_files(file_id,name,mime,generation,hash,ctime,size,fk_author_id,fk_scene_id,data) */;
CREATE INDEX archived_scenes ON scenes(scene_id, archived);
