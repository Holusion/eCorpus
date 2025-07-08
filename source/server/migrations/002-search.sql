--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scenes_search_terms (
  fk_scene_id BIGINT REFERENCES scenes(scene_id) ON DELETE CASCADE,
  language regconfig NOT NULL,
  ts_terms tsvector,
  UNIQUE(fk_scene_id, language)
);

CREATE INDEX scenes_search_idx ON scenes_search_terms USING GIN (ts_terms);

-- create search configurations that maps voyager language names to a dictionary
CREATE TEXT SEARCH CONFIGURATION public.EN (COPY = pg_catalog.english);
CREATE TEXT SEARCH CONFIGURATION public.ES (COPY = pg_catalog.spanish);
CREATE TEXT SEARCH CONFIGURATION public.DE (COPY = pg_catalog.german);
CREATE TEXT SEARCH CONFIGURATION public.NL (COPY = pg_catalog.dutch);
CREATE TEXT SEARCH CONFIGURATION public.FR (COPY = pg_catalog.french);

-- cast language codes to regconfig but instead of raising an error, default to 'simple' if dict does not exist 
CREATE  FUNCTION cast_to_regconfig(text) RETURNS regconfig AS $$
begin
    return cast($1 as regconfig);
exception
    when undefined_object then
        return 'simple'::regconfig;
end;
$$ language 'plpgsql' IMMUTABLE;


ALTER TABLE scenes ADD column meta JSONB;


CREATE  FUNCTION parse_svx_scene(JSONB) RETURNS JSONB AS $$
BEGIN
RETURN jsonb_build_object(
      'titles', scene_titles,
      'intros', scene_intros,
      'copyright', scene_copyright,
      'articles', array_agg(DISTINCT jsonb_build_object('titles', articles -> 'titles', 'leads', articles->'leads', 'uris', articles->'uris')),
      'annotations', array_agg(DISTINCT jsonb_build_object('titles', annotations -> 'titles', 'leads', annotations->'leads')),
      'tours', array_agg(DISTINCT jsonb_build_object('titles', tours -> 'titles', 'leads', tours->'leads')),
      'languages', array_agg( DISTINCT languages)
    )
  FROM
    jsonb_path_query($1, ('lax $.metas[' || COALESCE($1->'scenes'->>'meta','0') || '].collection.titles')::jsonpath) as scene_titles
    FULL JOIN jsonb_path_query($1, ('lax $.metas[' || COALESCE($1->'scenes'->>'meta','0') || '].collection.intros')::jsonpath) as scene_intros ON TRUE 
    FULL JOIN jsonb_path_query($1, 'lax $.assets.copyright') as scene_copyright ON TRUE
    FULL JOIN jsonb_path_query($1, 'lax $.models[*].annotations[*]') AS annotations ON TRUE
    FULL JOIN jsonb_path_query($1, 'lax $.metas[*].articles[*]') as articles ON TRUE
    FULL JOIN jsonb_path_query($1, 'lax $.setups[*].tours[*]') as tours ON TRUE
    LEFT JOIN LATERAL jsonb_object_keys(
      coalesce(annotations->'titles', '{}'::jsonb) ||
      coalesce(annotations->'leads', '{}'::jsonb) ||
      coalesce(articles->'titles', '{}'::jsonb) ||
      coalesce(articles->'leads', '{}'::jsonb) ||
      coalesce(scene_titles, '{}'::jsonb)
    ) AS languages ON TRUE

  GROUP BY scene_titles, scene_intros, scene_copyright
  ;
END
$$ LANGUAGE 'plpgsql';

CREATE  FUNCTION update_search_terms(BIGINT) RETURNS VOID AS $$
BEGIN

  WITH --
    scene AS (SELECT meta, scene_name, scene_id FROM scenes  WHERE scene_id =  $1),
    articles AS (SELECT value as article FROM scene, jsonb_array_elements(scene.meta -> 'articles')),
    annotations AS (SELECT value as annotation  FROM scene, jsonb_array_elements(scene.meta -> 'annotations')),
    tours AS (SELECT value as tour  FROM scene, jsonb_array_elements(scene.meta -> 'tours'))
  INSERT INTO scenes_search_terms
  SELECT
    scene.scene_id,
    language,
    setweight(to_tsvector(language, scene_name), 'A') ||
    setweight(to_tsvector(language, COALESCE((meta->'titles'-> language_string)::text , '')), 'A') ||
    setweight(to_tsvector(language, COALESCE((meta->'intros'-> language_string)::text , '')), 'B') ||
    setweight(to_tsvector(language, COALESCE((meta->'copyright'-> language_string)::text , '')), 'B')||
    setweight(to_tsvector(language, COALESCE(
      (SELECT string_agg(article -> 'titles' ->> language_string, ' ') FROM articles)
    , '')), 'B') ||
    setweight(to_tsvector(language, COALESCE(
      (SELECT string_agg(article -> 'leads' ->> language_string, ' ') FROM articles)
    , '')), 'C') ||
    setweight(to_tsvector(language, COALESCE(
      (SELECT string_agg(annotation -> 'titles' ->> language_string, ' ') FROM annotations)
    , '')), 'B') ||
    setweight(to_tsvector(language, COALESCE(
      (SELECT string_agg(annotation -> 'leads' ->> language_string, ' ') FROM annotations)
    , '')), 'C') ||
    setweight(to_tsvector(language, COALESCE(
      (SELECT string_agg(tour -> 'titles' ->> language_string, ' ') FROM tours)
    , '')), 'B') ||
    setweight(to_tsvector(language, COALESCE(
      (SELECT string_agg(tour -> 'leads' ->> language_string, ' ') FROM tours)
    , '')), 'C') ||
    setweight(to_tsvector(language, COALESCE( string_agg(DISTINCT articles_text.data, ' ') , '')), 'C')
    as ts_terms

  FROM
    scene
    CROSS JOIN LATERAL (
      SELECT language_string, cast_to_regconfig(language_string) as language 
      FROM jsonb_array_elements_text(meta->'languages') as language_string
      WHERE language_string IS NOT NULL
    ) as lang
    LEFT JOIN current_files as articles_text ON (fk_scene_id = scene.scene_id AND data IS NOT NULL AND mime SIMILAR TO 'text/(plain|html)')
  
  GROUP BY scene.scene_id, scene.scene_name, scene.meta, language, language_string
  ON CONFLICT (fk_scene_id,language) DO UPDATE SET ts_terms = EXCLUDED.ts_terms
  ;
END
$$ LANGUAGE 'plpgsql';


CREATE FUNCTION update_scene_meta() RETURNS TRIGGER AS $$
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


-- trigger when the scene file or an article is updated : call update_search_terms
CREATE CONSTRAINT TRIGGER update_search_terms_on_file_update
AFTER INSERT ON files
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW 
WHEN (NEW.name = 'scene.svx.json'
 OR NEW.mime = 'text/plain' OR NEW.mime = 'text/html' 
)
EXECUTE FUNCTION update_scene_meta();


-- Retroactively update all existing scenes to add meta
UPDATE scenes 
SET meta = parse_svx_scene(documents.data::jsonb)
FROM current_files as documents WHERE (fk_scene_id = scene_id AND name = 'scene.svx.json' AND data IS NOT NULL);

-- Fill-in search_terms table



--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------
DROP TEXT SEARCH CONFIGURATION public.EN;
DROP TEXT SEARCH CONFIGURATION public.ES;
DROP TEXT SEARCH CONFIGURATION public.DE;
DROP TEXT SEARCH CONFIGURATION public.NL;
DROP TEXT SEARCH CONFIGURATION public.FR;

DROP INDEX scenes_search_idx;
DROP TABLE scenes_search_terms;

DROP TRIGGER IF EXISTS update_search_terms_on_file_update ON files CASCADE;

DROP FUNCTION parse_svx_scene;
DROP FUNCTION update_scene_meta;
DROP FUNCTION update_search_terms;
DROP FUNCTION cast_to_regconfig;

ALTER TABLE scenes DROP COLUMN meta;
