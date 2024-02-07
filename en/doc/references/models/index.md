---
title:  3D Models
---

## 3D models: basic principles

Models should be in [GLTF-binary](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html){:target="_blank"} format (`.glb` files), though other formats might work.

Compression (using [Draco](https://google.github.io/draco/){:target="_blank"}) is supported and will generally speed up loading : faster network transfer and faster object parsing.

The Blender [GLTF export](https://github.com/KhronosGroup/glTF-Blender-IO){:target="_blank"} is a good reference implementation and should generally be trusted.

### Export for eCorpus

[Blender](https://www.blender.org/){:target="_blank"} is the best solution to convert files from pretty much anything to glTF because it embeds the official plugin from the Khronos group, the consortium behind the glTF format.

<div>
    <h3>Export menu</h3>
    <p>The glTF plugin is installed by default with Blender. Make sure you are using a recent version of Blender, preferably 4.0 or higher.</p>
    <p> Click on <b>File > Export > glTF 2.0</b> to open the export window</p>
    <p>You can choose to export only selected items or the whole scene.</p>
    <figure>
      <img alt="Screenshot of Blender's export menu" src="/assets/img/doc/blender_export_gltf.webp"/>
      <figcaption>Blender's export menu</figcaption>
    </figure>
</div>

<h3>Export Options</h3>
<div>
    <figure>
      <img alt="screenshot of Blender's glTF export popup" src="/assets/img/doc/blender_export_gltf_options.webp"/>
      <figcaption>glTF export popup</figcaption>
    </figure>
    <p>For advanced use cases, check out the official documentation at <a href="https://docs.blender.org/manual/en/4.0/addons/import_export/scene_gltf2.html" target="_blank">doc.blender.org</a>.</p>
      <p>The <b>Binary</b> format (<code>.glb</code>) is recommended.</p>
      <p>It is also possible to choose between <b>Z up</b> and <b>Y up</b> in the <b>Transform</b> menu for the scene's axis orientation.</p>
      <p>Draco compression is supported and will generally speed up loading : faster network transfer and faster object parsing.</p>
      <p>It is generally not useful to modify the compression settings.</p>
</div>

### Size

Recommended sizes (faces and map size):
 - **Thumb**   The lowest available representation. Always loaded first, with the goal of displaying a first representation of the model as quickly as possible. We recommend using a compressed GLB file with a total size of less than 200k.
 - **Low**     Used on older mobile devices. Maximum texture size: 1024 x 1024 pixels. Recommended mesh size: ~150k faces.
 - **Medium**  Used on newer mobile devices. Maximum texture size: 2048 x 2048 pixels. Recommended mesh size: ~150k faces.
 - **High**    Used on desktop devices. Maximum texture size: 4096 x 4096 pixels. Recommended mesh size: ~150k faces.
 - **Highest** Used for quality inspection. Texture size: 4k or 8k. Mesh size: ~500k faces.

### Import

Either import as a new scene or, to update an existing scene's model : 

```sh
curl -XPUT -u <username>:<password> -d @</path/.to/file.glb> https://ecorpus.holusion.com/scenes/<scene-name>/models/<filename.glb>
```
Then configure the model's derivatives (ref needed).
