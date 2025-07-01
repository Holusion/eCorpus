--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE MATERIALIZED VIEW current_docs AS
  SELECT 
    files.*
  FROM 
    (
      SELECT
        MAX(generation) as generation,
        name,
        fk_scene_id
      FROM files
      WHERE (mime = 'application/si-dpo-3d.document+json' AND data IS NOT NULL)
      GROUP BY name, fk_scene_id
    ) AS gen
    JOIN files USING(generation, name, fk_scene_id)
    
;


CREATE MATERIALIZED VIEW IF NOT EXISTS scenes_search_terms AS
  SELECT 
    scene_id,
    language,
    setweight( to_tsvector(language :: regconfig, agg_titles),  'A') ||
    setweight( to_tsvector(language :: regconfig, agg_intros),  'B') ||
    setweight( to_tsvector(language :: regconfig, agg_article_titles), 'B') ||
    setweight( to_tsvector(language :: regconfig, agg_article_leads),  'C') ||
    setweight(to_tsvector(language::regconfig,agg_articles),   'C') ||
    setweight(to_tsvector(language::regconfig,agg_annotation_titles),'B') ||
    setweight(to_tsvector(language::regconfig,agg_annotation_leads),'C') ||
    setweight( to_tsvector(language :: regconfig, copyright), 'B') AS ts_terms 
  FROM (
      SELECT 
        articles.fk_scene_id AS scene_id, 
        copyright,
        CASE 
          WHEN COALESCE(titles.key, leads.key) = 'EN' THEN 'english' 
          WHEN COALESCE(titles.key, leads.key) = 'FR' THEN 'french' 
          ELSE 'simple' END AS language, 
        COALESCE(STRING_AGG(titles.value, ' '), '') AS agg_article_titles, 
        COALESCE(STRING_AGG(leads.value, ' '), '') AS agg_article_leads, 
        COALESCE(STRING_AGG(current_files.data :: text, ' '), '') AS agg_articles, 
        COALESCE(STRING_AGG(collection_titles.value, ' '), '') AS agg_titles, 
        COALESCE(STRING_AGG(collection_intros.value, ' '), '') AS agg_intros,
        COALESCE(STRING_AGG(annotation_titles_text, ' '), '') AS agg_annotation_titles,
        COALESCE(STRING_AGG(annotation_titles_text, ' '), '') AS agg_annotation_leads
      FROM (
          SELECT 
            fk_scene_id, 
            copyright,
            (articles_json -> 'titles') AS all_titles_json, 
            (articles_json -> 'leads') AS all_leads_json, 
            (articles_json -> 'uris') AS all_uris_json,
            (metas::jsonb -> 'collection' -> 'titles') AS collection_title_json,
            (metas::jsonb -> 'collection' -> 'intros') AS collection_intro_json
          FROM (
              SELECT 
                fk_scene_id, 
                data :: jsonb -> 'asset' -> 'copyright' AS copyright,
                jsonb_array_elements(data :: jsonb -> 'metas') AS metas 
                -- jsonb_array_elements(data :: jsonb -> 'models') AS models 
              FROM 
                current_docs
            ) AS metas_items, 
            jsonb_array_elements(metas :: jsonb -> 'articles') AS articles_json
        ) AS articles, 
        jsonb_each_text( articles.all_leads_json :: jsonb ) AS leads
        FULL JOIN jsonb_each_text( articles.all_titles_json :: jsonb ) AS titles USING(key) 
        FULL JOIN jsonb_each_text( articles.all_uris_json :: jsonb ) AS uris USING(key)
        FULL JOIN jsonb_each_text(articles.collection_title_json::jsonb) AS collection_titles USING(key)
        FULL JOIN jsonb_each_text(articles.collection_intro_json::jsonb) AS collection_intros USING(key) 
        LEFT JOIN current_files ON (uris.value = current_files.name) 
        FULL JOIN ( 
            SELECT 
                fk_scene_id,
                annotation_titles.value AS annotation_titles_text, 
                annotation_leads.value AS annotation_leads_text,
                COALESCE(annotation_titles.key, annotation_leads.key) as annotation_key
            FROM (
                SELECT 
                 -- For each annotation get the jsons of all its titles and all its leads from the scene file
                    fk_scene_id, 
                    (annotations_json.value -> 'titles') AS all_titles_json, 
                    (annotations_json.value -> 'leads') AS all_leads_json
                FROM ( -- select the annotations json field from a model
                    SELECT 
                    fk_scene_id,
                    models.value -> 'annotations' AS value 
                    FROM -- create a row per models in the scene
                        current_docs, jsonb_array_elements(data::jsonb -> 'models') AS models
                ) AS annotations_json_array,
                -- create a row per annotation in the annotations field
                jsonb_array_elements(annotations_json_array.value::jsonb) AS annotations_json
            ) as annotations,
            jsonb_each_text(annotations.all_leads_json::jsonb) AS annotation_leads
            FULL JOIN jsonb_each_text(annotations.all_titles_json::jsonb) AS annotation_titles USING(key)
        ) AS annotations_text ON (annotations_text.annotation_key = leads.key)
      WHERE articles.fk_scene_id = current_files.fk_scene_id AND articles.fk_scene_id = annotations_text.fk_scene_id
      GROUP BY COALESCE(titles.key, leads.key), articles.fk_scene_id, copyright
    ) AS aggregated_text_by_lang
;

CREATE INDEX IF NOT EXISTS scenes_search_idx ON scenes_search_terms USING GIN (ts_terms);

-- ensure indexes are up to date
ANALYZE;

\timing on

SELECT scene_name scene_rank 
FROM 
  (
    SELECT 
      scene_id, 
      MAX(ts_rank(ts_terms, websearch_to_tsquery(language::regconfig, 'decorative'))) AS scene_rank
    FROM 
      scenes_search_terms
    WHERE ts_terms @@ websearch_to_tsquery(language::regconfig, 'decorative')
    GROUP BY scene_id
    ORDER BY scene_rank DESC
  ) AS matches
  INNER JOIN scenes USING(scene_id)
;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------
DROP INDEX scenes_search_idx;
DROP MATERIALIZED VIEW scenes_search_terms;
DROP MATERIALIZED VIEW current_docs;