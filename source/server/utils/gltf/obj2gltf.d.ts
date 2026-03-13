/**
 * Type definitions for the `obj2gltf` package (basic / conservative).
 *
 * These definitions cover the common options documented in the project's README
 * and provide overloads so callers get a `Buffer` when `binary: true`.
 */
declare module 'obj2gltf' {

	/** Input may be a filesystem path, a Buffer, or a parsed object representation. */
	type ObjInput = string | NodeJS.ArrayBufferView | object;

	/** Options exposed by the obj2gltf library (derived from README flags). */
	export interface Obj2GltfOptions {
		/** Save as binary glTF (.glb). Default: false. */
		binary?: boolean;
		/** Writes out separate buffers and textures instead of embedding them. Default: false. */
		separate?: boolean;
		/** Write out separate textures only. Default: false. */
		separateTextures?: boolean;
		/** Do a more exhaustive check for texture transparency. Default: false. */
		checkTransparency?: boolean;
		/** Prevent reading files outside the input directory. Default: false. */
		secure?: boolean;
		/** Pack occlusion into the red channel of metallic-roughness texture. Default: false. */
		packOcclusion?: boolean;
		/** Treat .mtl values as metallic-roughness PBR. Default: false. */
		metallicRoughness?: boolean;
		/** Treat .mtl values as specular-glossiness PBR. Default: false. */
		specularGlossiness?: boolean;
		/** Save with KHR_materials_unlit extension. Default: false. */
		unlit?: boolean;
		/** Path to a combined metallic-roughness-occlusion texture that overrides .mtl. */
		metallicRoughnessOcclusionTexture?: string;
		/** Path to a specular-glossiness texture that overrides .mtl. */
		specularGlossinessTexture?: string;
		/** Path to occlusion texture that overrides .mtl. */
		occlusionTexture?: string;
		/** Path to normal texture that overrides .mtl. */
		normalTexture?: string;
		/** Path to baseColor / diffuse texture that overrides .mtl. */
		baseColorTexture?: string;
		/** Path to emissive texture that overrides .mtl. */
		emissiveTexture?: string;
		/** Path to alpha texture that overrides .mtl. */
		alphaTexture?: string;
		/** Up axis of the obj input (e.g. 'X', 'Y', 'Z' or string). */
		inputUpAxis?: string;
		/** Up axis of the converted glTF output (e.g. 'X', 'Y', 'Z' or string). */
		outputUpAxis?: string;
		/** Apply triangle winding order sanitization. Default: false. */
		triangleWindingOrderSanitization?: boolean;
		/** Allow material to be double sided. Default: false. */
		doubleSidedMaterial?: boolean;
		/** Base path to resolve external resources (MTL, images). */
		resourceDirectory?: string;
		/** Embed images into the glTF (default: false). */
		embedImages?: boolean;
		/** Use common materials (materialsCommon) compatible with older viewers. */
		materialsCommon?: boolean;
		/** Optimize the resulting glTF (where supported). */
		optimize?: boolean;
		/** Any additional plugin-specific options. */
		[key: string]: unknown;
	}

	/** Convert an OBJ to glTF JSON when called without options. */
	function obj2gltf(input: ObjInput): Promise<object>;

	/**
	 * Convert an OBJ to glTF JSON when `binary` is false or explicitly omitted.
	 * Returns a Promise resolving to the glTF JSON object.
	 */
	function obj2gltf(input: ObjInput, options?: Obj2GltfOptions & { binary?: false }): Promise<object>;

	/**
	 * Convert an OBJ to GLB when `binary` is true.
	 * Returns a Promise resolving to a Node `Buffer` containing the .glb binary.
	 */
	function obj2gltf(input: ObjInput, options: Obj2GltfOptions & { binary: true }): Promise<NodeJS.ArrayBufferView>;

	/** Generic fallback signature. */
	function obj2gltf(input: ObjInput, options?: Obj2GltfOptions): Promise<object | NodeJS.ArrayBufferView>;

	export = obj2gltf;
}