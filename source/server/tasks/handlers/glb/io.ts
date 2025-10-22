import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRDracoMeshCompression, KHRMeshQuantization, KHRTextureBasisu, EXTTextureWebP } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';


interface ParseGlbParams{
  file: string;
}

await MeshoptEncoder.ready;
export const io = new NodeIO()
  .registerExtensions([
    KHRDracoMeshCompression,
    KHRMeshQuantization,
    EXTMeshoptCompression,
    KHRTextureBasisu,
    EXTTextureWebP,
  ])
  .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'meshopt.decoder': MeshoptDecoder, 
      'meshopt.encoder': MeshoptEncoder,
  });
