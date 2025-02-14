---
title: Optimising 3D models
---

## SetUp your models for Voyager / eCorpus

DPO-Voyager mainly works with the format [glTF](https://registry.khronos.org/glTF/), specially created for web broadcasting.

The library used, [THREE.GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader) supports the majority of common extensions.

**Note**: it is not always necessary to over-optimize models. Keep in mind that optimization is always about compromizing. 

### Software Tools


The "basic" optimizations in this guide are accessible via most recent glTF exporters. We recommend the [Blender glTF](https://github.com/KhronosGroup/glTF-Blender-IO) plugin, very well maintained and updated regularly; which has an easy-to-use graphical interface.

For these [most advanded](#maximum-compression) cases, tools such as [gltfpack](https://meshoptimizer.org/gltf/) or [gltf-transform](https://gltf-transform.dev/) can also be necessary.

### Level of Detail

#### One model Scene

Only two quality levels will generally be useful:

 - **Thumb**: File size `< 1Mo`, average texture size `256x256`
 - **High**: Textures `4096x4096` or bigger. Up until 500k faces.

#### Multi-models Scenes


It may be useful to generate intermediate qualities to take advantage of the new dynamic Level of Detail features:

 - **Thumb**: File Size `< 1Mo`, average texture size `256x256`
 - **Low**: Textures `1024x1024`, `~100k` faces
 - **Medium**: Textures `2048x2048`, `~150k` faces
 - **High**: Textures `4096x4096` or bigger. Up until `500k` faces.

It is always possible to provide a higher model detail using `Highest` quality.

Keep in mind that these sizes are indicative and should be adapted to the needs of each project.

### Considerations

#### Performance

When optimising a 3D model, we put as much attention to the file size as the ressources that will be consumed to be displayed in the 3D scene.

This is why it is better to reduce the size of textures as much as possible before optimizing compression: Once in memory, an image of `4096x4096` 
pixels alone will occupy a significant portion of a phone's graphics memory.


### Compression

#### Light Compression

Gives heavier models, but easier to export and reuse in other tools.

Usually matches the default options of tools like **Scaniverse**.

 - Image format: **JPEG** (quality 85 to 95)
 - Mesh compression: **None**


#### Mid Compression

Lighter models, well suited to web distribution, but still easy to configure.


 - Image format: **WEBP** (quality 85 to 95)
 - Mesh compression: **DRACO** 

#### Maximum Compression

This type of technique is only accessible with "cutting edge" tools, such as  [gltfpack](https://meshoptimizer.org/gltf/) or [gltf-transform](https://gltf-transform.dev/).

 - Image format: **UASTC** (Occlusion/Roughness/Metalness) + **ETC1S** (Diffuse, Emissive)
 - Mesh compression: **MESHOPT** or  **DRACO**

##### Meshopt

The algorithm [Meshoptimizer](https://github.com/zeux/meshoptimizer) algorythm is optimized for Web format (using `Content-Encoding: deflate`) and a faster decoding.

##### KTX2

The [KTX](https://www.khronos.org/ktx/) format, developped by KhronosGroup allies image compression algorithms compatible with GPUs. It allows you to transfer still compressed files to VRAM.


The most used algorithms are **UASTC** and **ETC1S**, which generally produce larger files than  **WEBP**, but which drastically reduce the *GPU Memory* footprint of the scene and the transfer time of these textures, allowing smoother loading.

These two characteristics are crucial in the case of multi-model scenes where loading must be done in real time without blocking the user.

The complexity of these formats; their numerous configuration options; the difficulty in finding tools that support them; the compromises they require still reserve them for the moment for the most extreme optimization cases where all the more easily accessible performance gains have been explored.

### Conclusion

Proper processing of a model is a matter of compromise. There is no _best_ solution that fits all situations. We must first ask ourselves _for whom_ we are optimizing the model, _for what_ it will be used and _how_ it will be consumed.
