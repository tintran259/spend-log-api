import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';

export interface CloudinaryUploadParams {
  cloudName:  string;
  apiKey:     string;
  timestamp:  number;
  signature:  string;
  folder:     string;
  /** Eager transformation string — passed directly to Cloudinary FormData */
  eager:      string;
  uploadUrl:  string;
}

/**
 * Thumbnail preset: 400×400 square crop, 60% quality, WebP.
 * - ~15–30 KB per image (vs 2–5 MB original)
 * - Ideal for calendar grid cells and list thumbnails
 * - c_fill = smart-crop to fill the square
 */
const THUMBNAIL_TRANSFORM = 'w_400,h_400,c_fill,q_60,f_webp';

@Injectable()
export class StorageService {
  getUploadParams(folder: string = 'expenses'): CloudinaryUploadParams {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      throw new InternalServerErrorException('Cloudinary is not configured');
    }

    const timestamp = Math.round(Date.now() / 1000);

    // Cloudinary requires ALL upload params (except file, api_key, resource_type)
    // sorted alphabetically before signing.
    const paramsToSign = [
      `eager=${THUMBNAIL_TRANSFORM}`,
      `eager_async=false`,
      `folder=${folder}`,
      `timestamp=${timestamp}`,
    ].join('&');

    const signature = crypto
      .createHash('sha256')
      .update(paramsToSign + apiSecret)
      .digest('hex');

    return {
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder,
      eager:     THUMBNAIL_TRANSFORM,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    };
  }
}
