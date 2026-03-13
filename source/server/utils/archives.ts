
export interface ParsedFileEntry{
  scene?: string;
  /**
   * full path to the file from inside the scene's scope
   * eg: `articles/foo-xyz.html`
   */
  name?: string;

  /**True if file is a directory. */
  isDirectory: boolean;
}

/**
 * Parse an archive entry's name to extract its scene name
 * @param filepath 
 * @returns Undefined if a file is definitely not scoped to a scene
 */
export function parseFilepath(filepath: string): ParsedFileEntry{
  const isDirectory = filepath.endsWith("/");
  const pathParts = filepath.split("/").filter(p=>!!p);
  if(pathParts[0] == "scenes") pathParts.shift();
  if(pathParts.length === 0) return {isDirectory};
  const scene = pathParts.shift()!;
  const name = pathParts.join("/");
  return {
    scene,
    name: name.length? name: undefined,
    isDirectory,
  }
}

export function isMainSceneFile(filename: string){
  const name = filename.toLowerCase();
  return name.endsWith(".svx.json") || name.endsWith("index.html");
}