--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TEXT SEARCH CONFIGURATION fr
        ALTER MAPPING FOR hword, hword_part, word
        WITH unaccent, french_stem;

ALTER TEXT SEARCH CONFIGURATION en
        ALTER MAPPING FOR hword, hword_part, word
        WITH unaccent, english_stem;

CREATE OR REPLACE FUNCTION update_scene_meta() RETURNS TRIGGER AS $$
BEGIN
  IF ( NEW.mime = 'application/si-dpo-3d.document+json' ) THEN
    IF NEW.data IS NULL THEN 
      UPDATE scenes
      SET meta = NULL
      WHERE scene_id = NEW.fk_scene_id;
    ELSE
      UPDATE scenes
      SET meta = parse_svx_scene(NEW.data::jsonb)
      WHERE scene_id = NEW.fk_scene_id;
    END IF;
  END IF;
  IF (SELECT meta FROM scenes WHERE scene_id = NEW.fk_scene_id)  IS NULL THEN
    PERFORM update_search_terms_from_title(NEW.fk_scene_id);
  ELSE
    PERFORM update_search_terms(NEW.fk_scene_id);
  END IF;
  RETURN NULL;
END
$$ LANGUAGE 'plpgsql';

CREATE FUNCTION update_search_terms_from_title(BIGINT) RETURNS VOID AS $$
BEGIN
  INSERT INTO scenes_search_terms
  SELECT     
    scene.scene_id,
    language,
    setweight(to_tsvector(language, scene.scene_name), 'A') as ts_terms
  FROM 
    (SELECT * FROM scenes WHERE scenes.scene_id = $1) as scene
    CROSS JOIN LATERAL (
      SELECT language_string, cast_to_regconfig(language_string) as language 
      FROM unnest(ARRAY['FR', 'EN', 'ES']) as language_string
      WHERE language_string IS NOT NULL
    ) as lang
  GROUP BY scene.scene_id, scene.scene_name, language, language_string
  ON CONFLICT (fk_scene_id,language) DO UPDATE SET ts_terms = EXCLUDED.ts_terms;
END
$$ language 'plpgsql';


CREATE FUNCTION update_search_terms_on_rename() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.meta IS NULL THEN
    PERFORM update_search_terms_from_title(NEW.scene_id);
  ELSE
    PERFORM update_search_terms(NEW.scene_id);
  END IF;
  RETURN NULL;
END
$$ LANGUAGE 'plpgsql';

-- trigger when the scene file or an article is updated : call update_search_terms
CREATE CONSTRAINT TRIGGER update_search_terms_on_scene_rename
AFTER INSERT OR UPDATE ON scenes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW 
EXECUTE FUNCTION update_search_terms_on_rename();

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_search_terms_on_scene_rename ON scenes CASCADE;

CREATE OR REPLACE FUNCTION update_scene_meta() RETURNS TRIGGER AS $$
BEGIN
  IF ( NEW.mime = 'application/si-dpo-3d.document+json' ) THEN
    IF NEW.data IS NULL THEN 
      UPDATE scenes
      SET meta = NULL
      WHERE scene_id = NEW.fk_scene_id;
    ELSE
      UPDATE scenes
      SET meta = parse_svx_scene(NEW.data::jsonb)
      WHERE scene_id = NEW.fk_scene_id;
    END IF;
  END IF;
  PERFORM update_search_terms(NEW.fk_scene_id);
  RETURN NULL;
END
$$ LANGUAGE 'plpgsql';

DROP FUNCTION update_search_terms_from_title;
DROP FUNCTION update_search_terms_on_rename;

ALTER TEXT SEARCH CONFIGURATION fr
        ALTER MAPPING FOR hword, hword_part, word
        WITH french_stem;

ALTER TEXT SEARCH CONFIGURATION en
        ALTER MAPPING FOR hword, hword_part, word
        WITH english_stem;

DROP EXTENSION unaccent;
