import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncHandler, badRequest } from '../utils/errors.js';

const IMAGE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/recipes');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/jpeg': { extension: 'jpg', matches: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/png': { extension: 'png', matches: (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', matches: (bytes) => bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' },
};

async function saveImage(buffer, contentType) {
  const imageType = IMAGE_TYPES[contentType];
  if (!imageType) throw badRequest('Use a JPG, PNG, or WebP image.', 'IMAGE_TYPE_INVALID');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw badRequest('The image file is empty.', 'IMAGE_EMPTY');
  if (buffer.length > MAX_IMAGE_BYTES) throw badRequest('Choose an image smaller than 5 MB.', 'IMAGE_TOO_LARGE');
  if (!imageType.matches(buffer)) throw badRequest('The selected file does not match its image type.', 'IMAGE_CONTENT_INVALID');
  const filename = `${randomUUID()}.${imageType.extension}`;
  await fs.mkdir(IMAGE_DIRECTORY, { recursive: true });
  await fs.writeFile(path.join(IMAGE_DIRECTORY, filename), buffer, { flag: 'wx' });
  // Store a host-independent path: the API is served from a different origin in
  // production (Render) than in development (localhost), so an absolute URL
  // saved here would leak localhost into the database and break the deployed app.
  return `/uploads/recipes/${filename}`;
}

export const uploadRecipeImage = asyncHandler(async (req, res) => {
  const contentType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const imageUrl = await saveImage(req.body, contentType);
  res.status(201).json({ success: true, data: { imageUrl } });
});
