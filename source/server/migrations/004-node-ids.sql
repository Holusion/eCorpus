--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- add ids to nodes in every documents
WITH src AS (
  SELECT doc_id AS id, data, json_extract(data, "$.nodes") AS nodes 
  FROM documents 
) UPDATE documents 
  SET data = json_set(documents.data, "$.nodes", json(new_doc.data))
  FROM (
    SELECT 
      src.id as id, 
      json_group_array(
        json_set(
          json_extract(data,'$.nodes[' || key || ']'), 
          '$.id', lower(hex(randomBlob(6)))
        )
      ) as data
    FROM src, json_each(src.nodes)
    GROUP BY src.id
  ) AS new_doc
  WHERE doc_id = id;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

-- remove ids from nodes in every documents
WITH src AS (
  SELECT doc_id AS id, data, json_extract(data, "$.nodes") AS nodes 
  FROM documents 
) UPDATE documents 
  SET data = json_replace(documents.data, "$.nodes", json(new_doc.nodes))
  FROM (
    SELECT 
      src.id as id, 
      json_group_array(
        json_remove(
          json_extract(data,'$.nodes[' || key|| ']'), 
          '$.id'
        )
      ) as nodes
    FROM src, json_each(src.nodes)
    GROUP BY src.id
  ) AS new_doc
  WHERE doc_id = id; 
