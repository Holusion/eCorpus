--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- add ids to nodes and tours in every documents
WITH src AS (
  SELECT 
    doc_id AS id,
    data,
    json_extract(data, "$.nodes") AS nodes,
    json_extract(data, "$.setups[0].tours") AS tours
  FROM documents 
) UPDATE documents 
  SET data = json_set(
    documents.data, 
    "$.nodes", json(new_doc.nodes),
    "$.setups[0].tours", json(new_doc.tours)
  )
  FROM (
    SELECT 
      src.id AS id, 
      m_nodes.result AS nodes,
      m_tours.result AS tours
    FROM 
      src,
      (
        SELECT
          src.id AS id,
          json_group_array(
            json_insert(
              json_extract(data,'$.nodes[' || key || ']'), 
              '$.id', lower(hex(randomBlob(6)))
            )
          ) AS result
        FROM src, json_each(src.nodes)
        GROUP BY src.id
      ) AS m_nodes ON src.id = m_nodes.id, 
      (
        SELECT
          src.id AS id,
          json_group_array(
            json_insert(
              json_extract(data,'$.setups[0].tours[' || key || ']'), 
              '$.id', lower(hex(randomBlob(3)))
            )
          ) AS result
        FROM src, json_each(src.tours)
        GROUP BY src.id
      ) AS m_tours ON src.id = m_tours.id
  ) AS new_doc
  WHERE doc_id = new_doc.id;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

-- remove ids from nodes in every documents
WITH src AS (
  SELECT 
    doc_id AS id,
    data,
    json_extract(data, "$.nodes") AS nodes,
    json_extract(data, "$.setups[0].tours") AS tours
  FROM documents 
) UPDATE documents 
  SET data = json_replace(
    documents.data, 
    "$.nodes", json(new_doc.nodes),
    "$.setups[0].tours", json(new_doc.tours)
  )
  FROM (
    SELECT 
      src.id AS id, 
      m_nodes.result AS nodes,
      m_tours.result AS tours
    FROM 
      src,
      (
        SELECT
          src.id AS id,
          json_group_array(
            json_remove(
              json_extract(data,'$.nodes[' || key || ']'), 
              '$.id'
            )
          ) AS result
        FROM src, json_each(src.nodes)
        GROUP BY src.id
      ) AS m_nodes ON src.id = m_nodes.id, 
      (
        SELECT
          src.id AS id,
          json_group_array(
            json_remove(
              json_extract(data,'$.setups[0].tours[' || key || ']'), 
              '$.id'
            )
          ) AS result
        FROM src, json_each(src.tours)
        GROUP BY src.id
      ) AS m_tours ON src.id = m_tours.id
  ) AS new_doc
  WHERE doc_id = id;
