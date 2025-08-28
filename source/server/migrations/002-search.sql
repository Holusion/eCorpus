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
CREATE INDEX scenes_search_languages ON scenes_search_terms(language);
-- create search configurations that maps voyager language names to a dictionary
CREATE TEXT SEARCH CONFIGURATION public.EN (COPY = pg_catalog.english);
CREATE TEXT SEARCH CONFIGURATION public.ES (COPY = pg_catalog.spanish);
CREATE TEXT SEARCH CONFIGURATION public.DE (COPY = pg_catalog.german);
CREATE TEXT SEARCH CONFIGURATION public.NL (COPY = pg_catalog.dutch);
CREATE TEXT SEARCH CONFIGURATION public.FR (COPY = pg_catalog.french);

-- cast language codes to regconfig but instead of raising an error, default to 'simple' if dict does not exist 
CREATE FUNCTION cast_to_regconfig(text) RETURNS regconfig AS $$
begin
    return cast(UPPER($1) as regconfig);
exception
    when undefined_object then
        return 'simple'::regconfig;
end;
$$ language 'plpgsql' IMMUTABLE;


ALTER TABLE scenes ADD column meta JSONB;


CREATE OR REPLACE FUNCTION parse_svx_scene(JSONB) RETURNS JSONB 
STABLE RETURNS NULL ON NULL INPUT
PARALLEL SAFE
AS $$
DECLARE
  meta_idx integer;
  scene_meta jsonb;
  scene_titles jsonb;
  scene_intros jsonb;
  scene_tours jsonb[];
  scene_annotations jsonb[];
  scene_articles jsonb[];
  scene_languages text[];
BEGIN

  meta_idx = COALESCE(CAST($1->'scenes'-> 0 -> 'meta' AS integer), 0);
  scene_meta = $1 -> 'metas' -> meta_idx;
  scene_titles = coalesce(scene_meta -> 'collection' -> 'titles', '{}'::jsonb);
  scene_intros = coalesce(scene_meta -> 'collection' -> 'intros', '{}'::jsonb);


  SELECT array_agg( jsonb_strip_nulls( jsonb_build_object(
    'titles', tour->'titles',
    'leads', tour->'leads'
  )))
  INTO STRICT scene_tours
  FROM
    jsonb_array_elements($1 -> 'setups') AS setup,
    jsonb_array_elements(setup -> 'tours') AS tour
  ;


  SELECT array_agg( jsonb_strip_nulls( jsonb_build_object(
    'titles', annotation->'titles',
    'leads', annotation->'leads'
  )))
  INTO STRICT scene_annotations
  FROM
    jsonb_array_elements($1 -> 'models') AS model,
    jsonb_array_elements(model -> 'annotations') AS annotation
  ;

  SELECT array_agg( jsonb_strip_nulls( jsonb_build_object(
    'titles', article->'titles',
    'leads', article->'leads',
    'uris', article->'uris'
  )))
  INTO STRICT scene_articles
  FROM 
    jsonb_array_elements($1 -> 'metas') AS meta,
    jsonb_array_elements(meta -> 'articles') AS article
  ;

  SELECT array_agg(DISTINCT object_keys)
  INTO STRICT scene_languages
  FROM
    (( SELECT keys.object_keys FROM
      unnest( scene_annotations || scene_articles || scene_tours ) as maps
      CROSS JOIN LATERAL (
        SELECT jsonb_object_keys(maps -> 'titles') AS object_keys
        UNION
        SELECT jsonb_object_keys(maps -> 'leads') AS object_keys
      )  AS keys
    ) 
    UNION SELECT jsonb_object_keys(scene_titles) AS object_keys
    UNION SELECT jsonb_object_keys(scene_intros) AS object_keys)
    AS object_keys
  ;

  RETURN jsonb_strip_nulls( jsonb_build_object(
    'titles', scene_titles,
    'intros', scene_intros,
    'copyright', $1 -> 'asset' ->> 'copyright',
    'articles', scene_articles,
    'annotations', scene_annotations,
    'tours', scene_tours,
    'languages', COALESCE(scene_languages, ARRAY[]::text[]),
    'primary_language', $1 -> 'setups' -> 0 -> 'language' ->> 'language'
  ));
END
$$ LANGUAGE 'plpgsql';

CREATE  FUNCTION update_search_terms(BIGINT) RETURNS VOID AS $$
BEGIN

  WITH
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
    setweight(to_tsvector(language, COALESCE((meta->'copyright')::text , '')), 'B')||
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
