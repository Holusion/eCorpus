import {
	BufferUtils,
	type Document,
	FileUtils,
	type ILogger,
	ImageUtils,
	type Texture,
	TextureChannel,
	type Transform,
} from '@gltf-transform/core';

import { KHRTextureBasisu } from '@gltf-transform/extensions';
import {
	createTransform,
	getTextureChannelMask,
	getTextureColorSpace,
	listTextureSlots,
} from '@gltf-transform/functions';
import fs from 'fs/promises';
import os from 'os';
import path, { join } from 'path';
import sharp from 'sharp';

import {getKtxVersion, run} from "../../command.js";
import { formatBytes } from '../../../utils/format.js';

const NUM_CPUS = os.cpus().length || 1;

const { R, G, A } = TextureChannel;



/**********************************************************************************************
 * Interfaces.
 */

export const Mode = {
	ETC1S: 'etc1s',
	UASTC: 'uastc',
} as const;


interface GlobalOptions {
	mode: typeof Mode[keyof typeof Mode];
	/**
	 * Pattern matching the material texture slot(s) to be compressed or converted.
	 */
	slots: RegExp;
  tmpdir: string;
}

export interface ETC1SOptions extends GlobalOptions {
  mode: typeof Mode.ETC1S;
	quality?: number;
	compression?: number;
	rdo?: boolean;
}

export interface UASTCOptions extends GlobalOptions {
  mode: typeof Mode.UASTC;
	level?: number;
	zstd?: number;
}


/**********************************************************************************************
 * Implementation.
 */

export const toktx = function (options: ETC1SOptions | UASTCOptions): Transform {

	return createTransform(options.mode, async (doc: Document): Promise<void> => {
		const logger = doc.getLogger();

		// Confirm recent version of KTX-Software is installed.
		logger.debug(`Found ktx version: ${await getKtxVersion()}`) ;

		const tmpdir = options.tmpdir;
		const batchPrefix = path.basename(tmpdir);

		const basisuExtension = doc.createExtension(KHRTextureBasisu).setRequired(true);

		const textures = doc.getRoot().listTextures();

    for (let textureIndex = 0; textureIndex< textures.length; textureIndex++){
      const texture = textures[textureIndex];
      const slots = listTextureSlots(texture);
      const channels = getTextureChannelMask(texture);
      const textureLabel =
        texture.getURI() ||
        texture.getName() ||
        `${textureIndex + 1}/${doc.getRoot().listTextures().length}`;
      const prefix = `ktx:texture(${textureLabel})`;
      logger.debug(`${prefix}: Slots → [${slots.join(', ')}]`);

      // FILTER: Exclude textures that don't match (a) 'slots' or (b) expected formats.

      let srcMimeType = texture.getMimeType();

      if (srcMimeType === 'image/ktx2') {
        logger.debug(`${prefix}: Skipping, already KTX.`);
        return;
      } else if (srcMimeType !== 'image/png' && srcMimeType !== 'image/jpeg') {
        logger.warn(`${prefix}: Skipping, unsupported texture type "${texture.getMimeType()}".`);
        return;
      } else if (options.slots && !slots.find((slot) => slot.match(options.slots))) {
        logger.debug(`${prefix}: Skipping, [${slots.join(', ')}] excluded by "slots" parameter.`);
        return;
      }

      let srcImage = texture.getImage()!;
      let srcExtension = texture.getURI()
        ? FileUtils.extension(texture.getURI())
        : ImageUtils.mimeTypeToExtension(texture.getMimeType());
      const srcSize = texture.getSize();
      const srcBytes = srcImage ? srcImage.byteLength : null;

      if (!srcImage || !srcSize || !srcBytes) {
        logger.warn(`${prefix}: Skipping, unreadable texture.`);
        return;
      }

      //Resize
      if(!srcSize.every(n=>isMultipleOfFour(n))){
				// Constrain texture size to a multiple of four
				// To be conservative with 3D API compatibility
				// @see https://github.khronos.org/KTX-Specification/ktxspec.v2.html#dimensions
				logger.warn(`Source image ${texture.getName()} at index ${textureIndex} is ${srcSize.join("x")} px. Resizing to a multiple of four`);
        const encoder = sharp(srcImage, { limitInputPixels: 32768 * 32768 }).toFormat('png');

        const dstSize = srcSize.map(n=> ceilMultipleOfFour(n));

        if(!dstSize.every(n=>isPowerofTwo(n))){
          logger.warn(`${prefix}: Resizing ${srcSize.join('x')} → ${dstSize.join('x')}px: This is not a power of two, which might not be optimal for performance`);
        }else{
          logger.debug(`${prefix}: Resizing ${srcSize.join('x')} → ${dstSize.join('x')}px`);
        }

        encoder.resize(dstSize[0], dstSize[1], { fit: 'fill', kernel: 'lanczos3' });

        srcImage = BufferUtils.toView((await encoder.toBuffer()) as Uint8Array);
        srcExtension = 'png';
        srcMimeType = 'image/png';
      }

      // PREPARE: Create temporary in/out paths for the 'ktx' CLI tool, and determine
      // necessary command-line flags.

      const srcPath = join(tmpdir, `${batchPrefix}_${textureIndex}.${srcExtension}`);
      const dstPath = join(tmpdir, `${batchPrefix}_${textureIndex}.ktx2`);

      await fs.writeFile(srcPath, srcImage);

      const params = [
        'create',
        ...createParams(texture, slots, channels, options),
        srcPath,
        dstPath,
      ];
      logger.debug(`${prefix}: Spawning → ktx ${params.join(' ')}`);

      // COMPRESS: Run `ktx create` CLI tool.
      const { code, stdout, stderr} = await  run('ktx', params as string[]);

      if (code !== 0) {
        logger.error(`${prefix}: Failed with code [${code}]:\n\n${stderr.toString()}`);
      } else {
        // PACK: Replace image data in the glTF asset.
        texture.setImage(await fs.readFile(dstPath) as Uint8Array).setMimeType('image/ktx2');
        if (texture.getURI()) {
          texture.setURI(FileUtils.basename(texture.getURI()) + '.ktx2');
        }
      }

      const dstBytes = texture.getImage()!.byteLength;
      logger.debug(`${prefix}: ${formatBytes(srcBytes)} → ${formatBytes(dstBytes)} bytes`);
    };

		const usesKTX2 = doc
			.getRoot()
			.listTextures()
			.some((t) => t.getMimeType() === 'image/ktx2');

		if (!usesKTX2) {
			basisuExtension.dispose();
		}
	});
};

/**********************************************************************************************
 * Utilities.
 */

/** Create CLI parameters from the given options. Attempts to write only non-default options. */
function createParams(
	texture: Texture,
	slots: string[],
	channels: number,
	options: ETC1SOptions | UASTCOptions,
): (string | number)[] {
	const colorSpace = getTextureColorSpace(texture);
	const params: (string | number)[] = ['--generate-mipmap'];


	// See: https://github.com/KhronosGroup/KTX-Software/issues/600
	const isNormalMap = slots.find((slot) => /normal/.test(slot));

	if (options.mode === Mode.UASTC) {
		const _options = options as UASTCOptions;
		params.push('--encode', 'uastc');
		params.push('--uastc-quality', _options.level ?? 2);

		if (_options.zstd !== 0) {
			params.push('--zstd', _options.zstd ?? 18);
		}
	} else {

		const _options = options as ETC1SOptions;
		params.push('--encode', 'basis-lz');

		params.push('--qlevel', _options.quality ?? 128);
		params.push('--clevel', _options.compression ?? 1);

		if ( _options.rdo === false || isNormalMap) {
			params.push('--no-endpoint-rdo', '--no-selector-rdo');
		}
	}

	// See: https://github.com/donmccurdy/glTF-Transform/issues/215
	if (colorSpace === 'srgb') {
		params.push('--assign-oetf', 'srgb', '--assign-primaries', 'bt709');
	} else if (colorSpace === 'srgb-linear') {
		params.push('--assign-oetf', 'linear', '--assign-primaries', 'bt709');
	} else if (slots.length && !colorSpace) {
		params.push('--assign-oetf', 'linear', '--assign-primaries', 'none');
	}

	if (channels === R) {
		params.push('--format', 'R8_UNORM');
	} else if (channels === G || channels === (R | G)) {
		params.push('--format', 'R8G8_UNORM');
	} else if (!(channels & A)) {
		params.push('--format', colorSpace === 'srgb' ? 'R8G8B8_SRGB' : 'R8G8B8_UNORM');
	} else {
		params.push('--format', colorSpace === 'srgb' ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM');
	}

  // See: https://github.com/donmccurdy/glTF-Transform/pull/389#issuecomment-1089842185
  const threads = Math.max(2, NUM_CPUS);
  params.push('--threads', threads);

	return params;
}


function isMultipleOfFour(value: number): boolean {
	return value % 4 === 0;
}

function isPowerofTwo(n:number) {
  // Check if n is positive and n & (n-1) is 0
  return (n > 0) && ((n & (n - 1)) === 0);
}


function ceilMultipleOfFour(value: number): number {
	if (value <= 4) return 4;
	return value % 4 ? value + 4 - (value % 4) : value;
}
