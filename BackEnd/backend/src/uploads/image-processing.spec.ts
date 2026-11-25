import { BadRequestException, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';
import { detectImageFormat, ImageProcessingService, MAX_IMAGE_BYTES } from './image-processing.service';

const file = (buffer: Buffer, mimetype: string, originalname = 'x') =>
  ({ buffer, mimetype, originalname, size: buffer.length }) as Express.Multer.File;

describe('ImageProcessingService', () => {
  const svc = new ImageProcessingService();
  let jpegWithExif: Buffer;
  let png: Buffer;
  let webp: Buffer;

  beforeAll(async () => {
    const base = () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#059669' } });
    jpegWithExif = await base()
      .withExif({ IFD0: { Copyright: 'Private Owner', Artist: 'Someone' } })
      .jpeg()
      .toBuffer();
    png = await base().png().toBuffer();
    webp = await base().webp().toBuffer();
  });

  it('detects formats from magic bytes', () => {
    expect(detectImageFormat(jpegWithExif)).toBe('jpeg');
    expect(detectImageFormat(png)).toBe('png');
    expect(detectImageFormat(webp)).toBe('webp');
    expect(detectImageFormat(Buffer.from('GIF89a........'))).toBeNull();
    expect(detectImageFormat(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
  });

  it('re-encodes to WebP, strips EXIF and downsizes large images', async () => {
    expect((await sharp(jpegWithExif).metadata()).exif).toBeDefined();
    const out = await svc.process(file(jpegWithExif, 'image/jpeg'));
    expect(out.mimeType).toBe('image/webp');
    expect(Math.max(out.width, out.height)).toBe(2048);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts PNG and WebP', async () => {
    await expect(svc.process(file(png, 'image/png'))).resolves.toMatchObject({ mimeType: 'image/webp' });
    await expect(svc.process(file(webp, 'image/webp'))).resolves.toMatchObject({ mimeType: 'image/webp' });
  });

  it('rejects disallowed MIME types, fake content, corrupted and oversized files', async () => {
    await expect(svc.process(file(png, 'image/gif'))).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    await expect(svc.process(file(Buffer.from('hello world'), 'image/jpeg'))).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    await expect(svc.process(file(Buffer.concat([png.subarray(0, 30), Buffer.alloc(100)]), 'image/png'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(svc.process(file(Buffer.alloc(MAX_IMAGE_BYTES + 1, 1), 'image/png'))).rejects.toBeInstanceOf(PayloadTooLargeException);
    await expect(svc.process(file(Buffer.alloc(0), 'image/png'))).rejects.toBeInstanceOf(BadRequestException);
  });
});
