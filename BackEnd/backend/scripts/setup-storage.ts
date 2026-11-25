/**
 * Creates (or updates) the four PRIVATE Supabase Storage buckets used by the API.
 *   npm run storage:setup
 *
 * All buckets are private: the browser never receives the service-role key and never reads objects
 * directly; the API issues short-lived signed URLs after checking permissions in PostgreSQL.
 * The API stores only re-encoded WebP images, but JPEG/PNG are allowed for manual uploads.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).');
  process.exit(1);
}

const buckets = [
  process.env.SUPABASE_TOILET_BUCKET || 'toilet-images',
  process.env.SUPABASE_SUGGESTION_BUCKET || 'suggestion-images',
  process.env.SUPABASE_REPORT_BUCKET || 'report-images',
  process.env.SUPABASE_AVATAR_BUCKET || 'avatars',
];
const options = {
  public: false,
  fileSizeLimit: 5 * 1024 * 1024,
  allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png'],
};

async function main() {
  const supabase = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: existing, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Cannot list buckets: ${error.message}`);
  for (const name of buckets) {
    const found = existing?.find((b) => b.name === name);
    const res = found ? await supabase.storage.updateBucket(name, options) : await supabase.storage.createBucket(name, options);
    if (res.error) throw new Error(`Bucket ${name}: ${res.error.message}`);
    console.log(`✔ ${found ? 'Updated' : 'Created'} private bucket "${name}"`);
  }
  console.log('Done. Do not add public-read policies to these buckets; access is granted via signed URLs only.');
}

main().catch((e: unknown) => {
  console.error(`✖ ${(e as Error).message}`);
  process.exit(1);
});
