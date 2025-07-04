
-- remove the "documents" table to merge it with the "files"
-- up and down aren't truly indempotent because document IDs are changed on each run.
-- However documents ID are not used in a manner that really required their stability until this migration

--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

PRAGMA foreign_keys = OFF;

--drop triggers, will recreate later
DROP TRIGGER delete_user;
DROP TRIGGER delete_scene;
DROP TRIGGER default_folders;

-- add authors to scenes
CREATE TABLE _scenes (
  scene_id INTEGER PRIMARY KEY,
  scene_name TEXT NOT NULL UNIQUE,
  ctime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  access TEXT DEFAULT '{"0":"read"}' CHECK(json_valid(access)),
  fk_author_id INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(fk_author_id) REFERENCES users(user_id)
);

INSERT INTO _scenes (scene_id, scene_name, ctime, access, fk_author_id) SELECT
  scene_id,
  scene_name,
  scenes.ctime as ctime,
  access,
  fk_author_id
  FROM scenes, documents ON documents.fk_scene_id = scene_id AND documents.generation = 1;

DROP TABLE scenes;

ALTER TABLE _scenes RENAME TO scenes;




ALTER TABLE files ADD COLUMN data TEXT DEFAULT NULL;

INSERT 
  INTO files ( name, mime, generation, hash, ctime, size, fk_author_id, fk_scene_id, data)
  SELECT 
    "scene.svx.json" as name,
    "application/si-dpo-3d.document+json" as mime,
    generation,
    NULL as hash, --hash is not set, have to handle this elsewhere
    ctime,
    LENGTH(CAST(data AS BLOB))as size,
    fk_author_id,
    fk_scene_id,
    data
  FROM documents;


-- we end up relying more on mime types to query documents
CREATE INDEX files_mime ON files(fk_scene_id, mime);

--recreate trigger for deleted users
CREATE TRIGGER delete_user AFTER DELETE ON users
BEGIN
  UPDATE files SET fk_author_id = 0 WHERE fk_author_id = OLD.user_id;
  UPDATE scenes SET fk_author_id = 0 WHERE fk_author_id = OLD.user_id;
  UPDATE scenes SET access = json_remove(access, '$.' || OLD.user_id) WHERE json_extract(access,'$.' || OLD.user_id) NOT NULL;
END;

--recreate scene triggers with adjustments
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
  ("articles", "text/directory", 1, "directory", 0 , 0, NEW.scene_id),
  ("models", "text/directory", 1, "directory", 0 , 0, NEW.scene_id);
END;


DROP INDEX docs_uid;
DROP TABLE documents;


-- Create a view for last-file for each scenes
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
;


PRAGMA foreign_keys = ON;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

PRAGMA foreign_keys = OFF;

DROP VIEW current_files;
DROP INDEX files_mime;

DROP TRIGGER delete_user;
DROP TRIGGER delete_scene;
DROP TRIGGER default_folders;


--Can't drop colmumn with a foreign key
CREATE TABLE _scenes (
  scene_id INTEGER PRIMARY KEY,
  scene_name TEXT NOT NULL UNIQUE,
  ctime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  access TEXT DEFAULT '{"0":"read"}' CHECK(json_valid(access))
);

INSERT INTO _scenes (scene_id, scene_name, ctime, access) SELECT
  scene_id,
  scene_name,
  scenes.ctime as ctime,
  access
  FROM scenes;

DROP TABLE scenes;

ALTER TABLE _scenes RENAME TO scenes;


CREATE TABLE documents (
  doc_id INTEGER PRIMARY KEY,
  data TEXT,
  ctime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generation INTEGER DEFAULT 1,
  fk_author_id INTEGER NOT NULL,
  fk_scene_id INTEGER NOT NULL,
  FOREIGN KEY(fk_scene_id) REFERENCES scenes(scene_id),
  FOREIGN KEY(fk_author_id) REFERENCES users(user_id)
);

INSERT 
  INTO documents (ctime, generation, fk_author_id, fk_scene_id, data)
  SELECT ctime, generation, fk_author_id, fk_scene_id, data 
  FROM files
  WHERE name = "scene.svx.json" AND mime="application/si-dpo-3d.document+json";

DELETE FROM files WHERE name = "scene.svx.json" AND mime = "application/si-dpo-3d.document+json";

ALTER TABLE files DROP COLUMN data;
CREATE UNIQUE INDEX docs_uid ON documents(fk_scene_id, generation DESC);


CREATE TRIGGER delete_user AFTER DELETE ON users
BEGIN
  UPDATE files SET fk_author_id = 0 WHERE fk_author_id = OLD.user_id;
  UPDATE documents SET fk_author_id = 0 WHERE fk_author_id = OLD.user_id;
  UPDATE scenes SET access = json_remove(access, '$.' || OLD.user_id) WHERE json_extract(access,'$.' || OLD.user_id) NOT NULL;
END;

CREATE TRIGGER delete_scene AFTER DELETE ON scenes
BEGIN
  DELETE FROM files WHERE fk_scene_id = OLD.scene_id;
  DELETE FROM documents WHERE fk_scene_id = OLD.scene_id;
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
  ("articles", "text/directory", 1, "directory", 0 , 0, NEW.scene_id),
  ("models", "text/directory", 1, "directory", 0 , 0, NEW.scene_id);
END;
