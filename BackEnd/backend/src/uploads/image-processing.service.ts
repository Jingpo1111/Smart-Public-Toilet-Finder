import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { sha256Hex } from '../common/utils/crypto';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_REQUEST = 5;
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Decompression-bomb guard: reject images above ~40 megapixels. */
const MAX_INPUT_PIXELS = 40_000_000;

export type DetectedFormat = 'jpeg' | 'png' | 'webp';

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  sizeBytes: number;
  /** SHA-256 of the ORIGINAL upload, used for duplicate detection. */
  sha256: string;
}

/** Detects the real format from magic bytes (the declared MIME type and file name are not trusted). */
export function detectImageFormat(buf: Buffer): DetectedFormat | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

/**
 * Validates and normalises an uploaded image:
 * 1. size limit, declared MIME allow-list, magic-byte detection, full decode with sharp;
 * 2. auto-rotates by EXIF orientation, then re-encodes to WebP — this strips ALL metadata
 *    (EXIF, GPS location, camera serials, ICC comments);
 * 3. downsizes large photos to at most `maxDimension` px on the longest edge.
 */
@Injectable()
export class ImageProcessingService {
  async process(file: Express.Multer.File, maxDimension = 2048): Promise<ProcessedImage> {
    const input = file?.buffer;
    if (!input || input.length === 0) throw new BadRequestException('Uploaded file is empty.');
    if (input.length > MAX_IMAGE_BYTES) {
      throw new PayloadTooLargeException(`Each image must be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
    }
    if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException('Only JPG/JPEG, PNG and WebP images are accepted.');
    }
    const detected = detectImageFormat(input);
    if (!detected) {
      throw new UnsupportedMediaTypeException('File content is not a JPG, PNG or WebP image.');
    }

    let format: string | undefined;
    try {
      const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
      format = meta.format;
      if (!meta.width || !meta.height) throw new Error('missing dimensions');
    } catch {
      throw new BadRequestException('The file is not a valid or supported image.');
    }
    if (format !== detected) {
      throw new UnsupportedMediaTypeException('File content does not match a supported image format.');
    }

    try {
      const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
        .rotate()
        .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      return {
        buffer: data,
        mimeType: 'image/webp',
        width: info.width,
        height: info.height,
        sizeBytes: data.length,
        sha256: sha256Hex(input),
      };
    } catch {
      throw new BadRequestException('The image could not be processed. It may be corrupted.');
    }
  }
}
