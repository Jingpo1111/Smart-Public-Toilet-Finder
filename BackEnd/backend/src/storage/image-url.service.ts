import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { StorageService } from './storage.service';

export interface StoredObjectRef {
  id: string;
  bucket: string;
  objectPath: string;
  mimeType?: string;
  width?: number | null;
  height?: number | null;
}

/** Image information returned by the API. `url` is a short-lived signed URL; refetch the resource after `expiresAt`. */
export interface ImageAccess {
  id: string;
  url: string;
  expiresAt: string;
  mimeType?: string;
  width?: number | null;
  height?: number | null;
}

interface CacheEntry {
  url: string;
  expiresAt: number;
}

/**
 * Issues signed URLs for objects the caller has ALREADY been authorised to see.
 * Callers are responsible for the authorisation check (public toilet, owner, admin, assigned manager).
 * A small in-memory cache re-uses URLs while more than half of their lifetime remains.
 */
@Injectable()
export class ImageUrlService {
  private readonly cache = new Map<string, CacheEntry>();
  private static readonly MAX_CACHE = 5000;

  constructor(
    private readonly storage: StorageService,
    private readonly config: AppConfigService,
  ) {}

  async sign<T extends StoredObjectRef>(refs: T[]): Promise<Map<string, ImageAccess>> {
    const ttl = this.config.supabase.signedUrlExpiresIn;
    const now = Date.now();
    const out = new Map<string, ImageAccess>();
    const missing = new Map<string, T[]>();

    for (const ref of refs) {
      const key = `${ref.bucket}/${ref.objectPath}`;
      const hit = this.cache.get(key);
      if (hit && hit.expiresAt - now > (ttl * 1000) / 2) {
        out.set(ref.id, this.toAccess(ref, hit.url, hit.expiresAt));
      } else {
        const list = missing.get(ref.bucket) ?? [];
        list.push(ref);
        missing.set(ref.bucket, list);
      }
    }

    for (const [bucket, list] of missing) {
      const paths = [...new Set(list.map((r) => r.objectPath))];
      const signed = await this.storage.createSignedUrls(bucket, paths, ttl);
      const expiresAt = now + ttl * 1000;
      for (const ref of list) {
        const url = signed.get(ref.objectPath);
        if (!url) continue;
        this.remember(`${bucket}/${ref.objectPath}`, { url, expiresAt });
        out.set(ref.id, this.toAccess(ref, url, expiresAt));
      }
    }
    return out;
  }

  async signOne(ref: StoredObjectRef | null | undefined): Promise<ImageAccess | null> {
    if (!ref) return null;
    return (await this.sign([ref])).get(ref.id) ?? null;
  }

  /** Drop cached URLs (after deletion / moderation) so removed images stop being served from the cache. */
  forget(bucket: string, objectPath: string): void {
    this.cache.delete(`${bucket}/${objectPath}`);
  }

  private remember(key: string, entry: CacheEntry) {
    if (this.cache.size >= ImageUrlService.MAX_CACHE) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, entry);
  }

  private toAccess(ref: StoredObjectRef, url: string, expiresAt: number): ImageAccess {
    return {
      id: ref.id,
      url,
      expiresAt: new Date(expiresAt).toISOString(),
      mimeType: ref.mimeType,
      width: ref.width ?? null,
      height: ref.height ?? null,
    };
  }
}
