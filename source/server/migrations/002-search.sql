--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS scenes_search_terms (
  fk_scene_id BIGINT REFERENCES scenes(scene_id),
  language regconfig NOT NULL,
  ts_terms tsvector,
  UNIQUE(fk_scene_id, language)
);

CREATE INDEX scenes_search_idx ON scenes_search_terms USING GIN (ts_terms);

-- aggregates tsvectors with the built-in concat function (backing the || operation)
CREATE AGGREGATE tsvector_agg (
  BASETYPE = pg_catalog.tsvector,
  SFUNC = pg_catalog.tsvector_concat,
  STYPE = pg_catalog.tsvector,
  INITCOND = ''
);

-- create search configurations that maps voyager language names to a dictionary
CREATE TEXT SEARCH CONFIGURATION public.EN (COPY = pg_catalog.english);
CREATE TEXT SEARCH CONFIGURATION public.ES (COPY = pg_catalog.spanish);
CREATE TEXT SEARCH CONFIGURATION public.DE (COPY = pg_catalog.german);
CREATE TEXT SEARCH CONFIGURATION public.NL (COPY = pg_catalog.dutch);
CREATE TEXT SEARCH CONFIGURATION public.FR (COPY = pg_catalog.french);

-- cast language codes to regconfig but instead of raising an error, default to 'simple' if dict does not exist 
CREATE OR REPLACE FUNCTION cast_to_regconfig(text) RETURNS regconfig AS $$
begin
    return cast($1 as regconfig);
exception
    when undefined_object then
        return 'simple'::regconfig;
end;
$$ language 'plpgsql' IMMUTABLE;


ALTER TABLE scenes ADD column meta JSONB;


CREATE OR REPLACE FUNCTION parse_svx_scene(JSONB) RETURNS JSONB AS $$
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
    jsonb_path_query($1, 'lax $.metas[1].collection.titles') as scene_titles
    FULL JOIN jsonb_path_query($1, 'lax $.metas[1].collection.intros') as scene_intros ON TRUE
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



-- trigger when the scene file or an article is updated : call update_search_terms
CREATE OR REPLACE FUNCTION update_search_terms(BIGINT) RETURNS VOID AS $$
BEGIN
  WITH 
    scene AS (SELECT meta, scene_id FROM scenes WHERE scene_id = $1)
  INSERT INTO scenes_search_terms
  SELECT
    scene.scene_id,
    language,
    setweight(to_tsvector(language, COALESCE((meta->'titles'-> language_string)::text , '')), 'A') ||
    setweight(to_tsvector(language, COALESCE((meta->'intros'-> language_string)::text , '')), 'B') ||
    setweight(to_tsvector(language, COALESCE((meta->'copyright'-> language_string)::text , '')), 'B')||
    setweight(to_tsvector(language, COALESCE( string_agg(DISTINCT articles_titles ->> language_string, ' '), '')), 'B') ||
    setweight(to_tsvector(language, COALESCE( string_agg(DISTINCT articles_leads ->> language_string, ' '), '')), 'C') ||
    setweight(to_tsvector(language, COALESCE( string_agg(DISTINCT articles.data, ' ') , '')), 'C') ||
    setweight(to_tsvector(language, COALESCE( string_agg(DISTINCT annotation_titles ->> language_string, ' '), '')), 'B') ||
    setweight(to_tsvector(language, COALESCE( string_agg(DISTINCT annotation_leads ->> language_string, ' '),  '')), 'C') ||
    setweight(to_tsvector(language, COALESCE( string_agg(DISTINCT tours_titles ->> language_string, ' '), '')), 'B') ||
    setweight(to_tsvector(language, COALESCE( string_agg(DISTINCT tours_leads ->> language_string, ' '),  '')), 'C')  as weighted_vectors

  FROM --fixme: explicit cross joins to make this more readable?
    scene
    CROSS JOIN LATERAL (SELECT language_string, cast_to_regconfig(language_string) as language FROM jsonb_array_elements_text(meta->'languages') as language_string) as lang,
    jsonb_path_query(meta, 'lax $.articles[*].titles') as articles_titles,
    jsonb_path_query(meta, 'lax $.articles[*].leads') as articles_leads,
    jsonb_path_query(meta, 'lax $.articles[*].uris') as articles_uris,
    jsonb_path_query(meta, 'lax $.annotations[*].titles') as annotation_titles,
    jsonb_path_query(meta, 'lax $.annotations[*].leads') as annotation_leads,
    jsonb_path_query(meta, 'lax $.tours[*].titles') as tours_titles,
    jsonb_path_query(meta, 'lax $.tours[*].leads') as tours_leads
    LEFT JOIN (SELECT data, name FROM current_files WHERE fk_scene_id = $1) as articles ON TRUE
    WHERE articles.name = articles_uris ->> language_string
  GROUP BY scene_id, language, language_string, meta
;

END
$$ LANGUAGE 'plpgsql';


CREATE OR REPLACE FUNCTION update_scene_meta(BIGINT, JSONB) RETURNS VOID AS $$
BEGIN
  UPDATE scenes
  SET meta = parse_svx_scene($2)
  WHERE scene_id = $1;
  
  PERFORM update_search_terms($1);
END
$$ LANGUAGE 'plpgsql';


-- ensure indexes are up to date
-- ANALYZE;
-- LOAD 'auto_explain';
-- SET auto_explain.log_nested_statements = ON; 
-- SET auto_explain.log_min_duration = 1;       -- exclude very fast queries taking < 1 ms
-- SET auto_explain.log_analyze = ON;        -- log execution times, too? (expensive!)


\timing on

SELECT COUNT(scene_id) 
FROM 
  ( 
    SELECT scenes.scene_id, current_files.data
    FROM
      scenes
      INNER JOIN current_files ON (fk_scene_id = scene_id AND name = 'scene.svx.json')
    WHERE scenes.archived IS NULL AND data IS NOT NULL
    LIMIT 5
  ) as scenes
  CROSS JOIN LATERAL update_scene_meta(scene_id, data::jsonb)
;


\timing off
-- SET auto_explain.log_nested_statements = OFF; 


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

DROP AGGREGATE tsvector_agg(VARIADIC "tsvector");
DROP FUNCTION parse_svx_scene;
DROP FUNCTION update_search_terms;
DROP FUNCTION cast_to_regconfig;

ALTER TABLE scenes DROP COLUMN meta;
