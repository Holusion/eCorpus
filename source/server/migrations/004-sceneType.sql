--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS scene_type text CONSTRAINT scene_type_values CHECK (scene_type = 'voyager' OR scene_type = 'html');

CREATE FUNCTION set_scene_type() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.name = 'scene.svx.json' THEN 
      UPDATE scenes
      SET scene_type = 'voyager'
      WHERE scene_id = NEW.fk_scene_id;
    ELSE
      UPDATE scenes
      SET scene_type = 'html'
      WHERE scene_id = NEW.fk_scene_id;
    END IF;
  RETURN NULL;
END
$$ LANGUAGE 'plpgsql';

-- trigger when the voyagger scene file or an index.html to set the type of the scene 
CREATE CONSTRAINT TRIGGER update_scene_type_on_file_update
AFTER INSERT ON files
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW 
WHEN (NEW.name = 'scene.svx.json'
 OR NEW.name = 'index.html')
EXECUTE FUNCTION set_scene_type();

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_scene_type_on_file_update ON files CASCADE;

DROP FUNCTION set_scene_type;


