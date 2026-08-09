import fs from 'fs';
import { Buffer } from 'buffer';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { URL } from 'url';
import webp from '@cwasm/webp';
import blockhash from './block-hash';

export { fingerprintPixels } from './core';
export type {
  BlockHashFingerprint,
  BlockHashFingerprintOptions,
  BlockHashPixelSource,
  BlockHashParameters,
  FingerprintAlgorithm,
  FingerprintEncoding,
  FingerprintOptions,
  FingerprintSchemaVersion,
  ImageFingerprint,
  Gray8PixelSource,
  PixelSource,
  Rgb8PixelSource,
  Rgba8PixelSource,
  RgbaImageData,
} from './core';

export interface UrlRequestObject extends RequestInit {
  encoding?: string | null;
  url: string | null;
}

export interface BufferObject {
  ext?: string,
  data: Buffer,
  name?: string
}

export type ImageHashCallback = (error: Error | null, data?: string) => void;

type ValidUrlRequestObject = UrlRequestObject & { url: string };

const toError = (error: unknown): Error => (
  error instanceof Error ? error : new Error(String(error))
);

const processPNG = (
  data: Buffer,
  bits: number,
  method: boolean,
  cb: ImageHashCallback,
): void => {
  try {
    const png = PNG.sync.read(data);
    const res = blockhash(png, bits, method ? 2 : 1);
    cb(null, res);
  } catch (error) {
    cb(toError(error));
  }
};

const processJPG = (
  data: Buffer,
  bits: number,
  method: boolean,
  cb: ImageHashCallback,
): void => {
  try {
    const decoded = jpeg.decode(data);
    const res = blockhash(decoded, bits, method ? 2 : 1);
    cb(null, res);
  } catch (error) {
    cb(toError(error));
  }
};

const processWebp = (
  data: Buffer,
  bits: number,
  method: boolean,
  cb: ImageHashCallback,
): void => {
  try {
    const decoded = webp.decode(data);
    const res = blockhash(decoded, bits, method ? 2 : 1);
    cb(null, res);
  } catch (error) {
    cb(toError(error));
  }
};

const isUrlRequestObject = (
  obj: UrlRequestObject | BufferObject,
): obj is ValidUrlRequestObject => {
  const casted = (obj as UrlRequestObject);
  return typeof casted.url === 'string' && casted.url.length > 0;
};

const isBufferObject = (obj: UrlRequestObject | BufferObject): obj is BufferObject => {
  const casted = (obj as BufferObject);
  return Buffer.isBuffer(casted.data);
};

const toRequestInit = (source: UrlRequestObject): RequestInit => {
  const {
    body,
    cache,
    credentials,
    headers,
    integrity,
    keepalive,
    method,
    mode,
    redirect,
    referrer,
    referrerPolicy,
    signal,
    window,
  } = source;

  return {
    body,
    cache,
    credentials,
    headers,
    integrity,
    keepalive,
    method,
    mode,
    redirect,
    referrer,
    referrerPolicy,
    signal,
    window,
  };
};

export const imageHash = (
  oldSrc: string | UrlRequestObject | BufferObject,
  bits: number,
  method: boolean,
  cb: ImageHashCallback,
): void => {
  const src = oldSrc;

  const getFileType = async (data: Buffer) => {
    if (typeof src !== 'string' && isBufferObject(src) && src.ext) {
      return {
        mime: src.ext,
      };
    }

    // file-type is ESM-only. Keeping this as a native dynamic import preserves the
    // package's CommonJS entrypoint while using modern Node module resolution.
    const { fileTypeFromBuffer } = await import('file-type');
    return fileTypeFromBuffer(data);
  };

  const checkFileType = (name: string | undefined, data: Buffer): void => {
    getFileType(data).then((type) => {
      // what is the image type
      if (!type) {
        cb(new Error('Mime type not found'));
        return;
      }
      if (name && name.lastIndexOf('.') > 0) {
        const ext = name
          .split('.')
          .pop()
          ?.toLowerCase();
        if (ext === 'png' && type.mime === 'image/png') {
          processPNG(data, bits, method, cb);
        } else if ((ext === 'jpg' || ext === 'jpeg') && type.mime === 'image/jpeg') {
          processJPG(data, bits, method, cb);
        } else if (ext === 'webp' && type.mime === 'image/webp') {
          processWebp(data, bits, method, cb);
        } else {
          cb(new Error(`Unrecognized file extension, mime type or mismatch, ext: ${ext} / mime: ${type.mime}`));
        }
      } else {
        if (process.env.verbose) console.warn('No file extension found, attempting mime typing.');
        if (type.mime === 'image/png') {
          processPNG(data, bits, method, cb);
        } else if (type.mime === 'image/jpeg') {
          processJPG(data, bits, method, cb);
        } else if (type.mime === 'image/webp') {
          processWebp(data, bits, method, cb);
        } else {
          cb(new Error(`Unrecognized mime type: ${type.mime}`));
        }
      }
    }).catch((err) => {
      cb(err);
    });
  };

  const fetchRemoteImage = async (
    requestUrl: string,
    init?: RequestInit,
  ): Promise<void> => {
    if (typeof fetch !== 'function') {
      cb(new Error('Global fetch API is not available. Node.js 22.14+ is required.'));
      return;
    }

    try {
      const response = await fetch(requestUrl, init);
      if (!response || !response.ok) {
        const status = response ? `${response.status} ${response.statusText}` : 'Unknown status';
        throw new Error(`Failed to fetch image. HTTP status: ${status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let pathname = '';
      try {
        const url = new URL(response.url || requestUrl);
        pathname = url.pathname;
      } catch {
        pathname = '';
      }

      checkFileType(pathname, buffer);
    } catch (error) {
      cb(toError(error));
    }
  };

  const handleReadFile = (err: NodeJS.ErrnoException | null, res: Buffer): void => {
    if (err) {
      cb(err);
      return;
    }
    checkFileType(typeof src === 'string' ? src : undefined, res);
  };

  // check source
  // is source assigned
  if (src === undefined) {
    cb(new Error('No image source provided'));
    return;
  }

  // is src url or file
  if (typeof src === 'string' && (src.indexOf('http') === 0 || src.indexOf('https') === 0)) {
    // url
    fetchRemoteImage(src);
  } else if (typeof src !== 'string' && isBufferObject(src)) {
    // image buffers
    checkFileType(src.name, src.data);
  } else if (typeof src !== 'string' && isUrlRequestObject(src)) {
    // Request Object
    fetchRemoteImage(src.url, toRequestInit(src));
  } else if (typeof src === 'string') {
    // file
    fs.readFile(src, handleReadFile);
  } else {
    cb(new Error('Invalid image source'));
  }
};
