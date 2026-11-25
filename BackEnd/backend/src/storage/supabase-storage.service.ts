import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppConfigService } from '../config/app-config.service';
import { StorageService } from './storage.service';

/**
 * Supabase Storage implementation. Uses the service-role key, which stays on the server.
 * Buckets must be created as private (see `npm run storage:setup` and README).
 */
@Injectable()
export class SupabaseStorageService extends StorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private readonly client: SupabaseClient;

  constructor(private readonly config: AppConfigService) {
    super();
    this.client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async upload(bucket: string, path: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).upload(path, data, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    });
    if (error) {
      this.logger.error(`Upload to ${bucket}/${path} failed: ${error.message}`);
      throw new ServiceUnavailableException('Image storage is currently unavailable. Please try again later.');
    }
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(bucket).remove(paths);
    if (error) {
      this.logger.error(`Removing ${paths.length} object(s) from ${bucket} failed: ${error.message}`);
      throw new ServiceUnavailableException('Image storage is currently unavailable. Please try again later.');
    }
  }

  async createSignedUrls(bucket: string, paths: string[], expiresInSeconds: number): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (paths.length === 0) return result;
    const { data, error } = await this.client.storage.from(bucket).createSignedUrls(paths, expiresInSeconds);
    if (error || !data) {
      this.logger.error(`Signing ${paths.length} URL(s) in ${bucket} failed: ${error?.message}`);
      return result; // images are omitted rather than failing the whole response
    }
    for (const item of data) {
      if (item.signedUrl && item.path) result.set(item.path, item.signedUrl);
    }
    return result;
  }

  async ping(): Promise<boolean> {
    try {
      const { error } = await this.client.storage.getBucket(this.config.supabase.buckets.toilet);
      return !error;
    } catch {
      return false;
    }
  }
}
