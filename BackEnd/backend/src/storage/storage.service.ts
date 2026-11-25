/**
 * Object storage abstraction. Production uses Supabase Storage (SupabaseStorageService);
 * integration tests swap in an in-memory implementation. All buckets are PRIVATE:
 * clients only ever receive short-lived signed URLs issued after a database authorisation check.
 */
export abstract class StorageService {
  abstract upload(bucket: string, path: string, data: Buffer, contentType: string): Promise<void>;
  abstract remove(bucket: string, paths: string[]): Promise<void>;
  /** Returns a map objectPath → signed URL. Paths that could not be signed are omitted. */
  abstract createSignedUrls(bucket: string, paths: string[], expiresInSeconds: number): Promise<Map<string, string>>;
  abstract ping(): Promise<boolean>;
}
