---
title:  3D Models
---

# Models preparation

Models should be in **GLTF-binary** format (`.glb` files), though other formats might work.

Compression (using [Draco](https://google.github.io/draco/)) is supported and will generally speed up loading : faster network transfer and faster object parsing.

The Blender [GLTF export](https://github.com/KhronosGroup/glTF-Blender-IO) is a good reference implementation and should generally be trusted.

## Export for eCorpus

[Blender](https://www.blender.org/) is the best solution to convert files from pretty much anything to glTF because it embeds the official plugin from the Khronos group, the consortium behind the glTF format.

<div class="row">
  <div class="col-12 col-lg-6">
    <h3>Export menu</h3>
    <p>The glTF plugin is installed by default with Blender. Make sure you are using a recent version of Blender, preferably 4.0 or higher.</p>
    <p> Click on <b>File > Export > glTF 2.0</b> to open the export window</p>
    <p>You can choose to export only selected items or the whole scene.</p>
  </div>
  <div class="col-12 col-lg-6 d-flex flex-column">
    <figure>
      <img class="img-fluid" alt="Screenshot of Blender's export menu" src="/assets/img/doc/blender_export_gltf.webp"/>
      <figcaption class="px-4">Blender's export menu</figcaption>
    </figure>
  </div>
</div>

<h3>Export Options</h3>
<div class="row">
  <div class="col-12 col-sm-6 col-xl-4">
    <figure>
      <img class="img-fluid" alt="screenshot of Blender's glTF export popup" src="/assets/img/doc/blender_export_gltf_options.webp"/>
      <figcaption class="px-4">glTF export popup</figcaption>
    </figure>
  </div>
  <div class="col-12 col-sm-6 col-xl-8">
    <p>For advanced use cases, check out the official documentation at <a href="https://docs.blender.org/manual/en/4.0/addons/import_export/scene_gltf2.html">doc.blender.org</a>.</p>
    <ul>
      <li>The <b>Binary</b> format (<code>.glb</code>) is recommended.</li>
      <li>It is also possible to choose between <b>Z up</b> and <b>Y up</b> in the <b>Transform</b> menu for the scene's axis orientation.</li>
      <li>Draco compression is supported and will generally speed up loading : faster network transfer and faster object parsing.</li>
      <li>It is generally not useful to modify the compression settings.</li>
    </ul>
  </div>
</div>

## Size

Recommended sizes (faces and map size):
 - **Thumb**   The lowest available representation. Always loaded first, with the goal of displaying a first representation of the model as quickly as possible. We recommend using a compressed GLB file with a total size of less than 200k.
 - **Low**     Used on older mobile devices. Maximum texture size: 1024 x 1024 pixels. Recommended mesh size: ~150k faces.
 - **Medium**  Used on newer mobile devices. Maximum texture size: 2048 x 2048 pixels. Recommended mesh size: ~150k faces.
 - **High**    Used on desktop devices. Maximum texture size: 4096 x 4096 pixels. Recommended mesh size: ~150k faces.
 - **Highest** Used for quality inspection. Texture size: 4k or 8k. Mesh size: ~500k faces.

## Import

Either import as a new scene or, to update an existing scene's model : 

```sh
curl -XPUT -u <username>:<password> -d @</path/.to/file.glb> https://ecorpus.holusion.com/scenes/<scene-name>/models/<filename.glb>
```
Then configure the model's derivatives (ref needed).
