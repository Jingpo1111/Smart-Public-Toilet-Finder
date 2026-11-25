import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { StorageService } from '../../src/storage/storage.service';

/** Test double for Supabase Storage: keeps objects in memory and issues fake signed URLs. */
@Injectable()
export class InMemoryStorageService extends StorageService {
  readonly objects = new Map<string, { data: Buffer; contentType: string }>();
  readonly signedPaths: string[] = [];
  private failAt: number | null = null;
  private uploads = 0;

  /** The next `n` uploads succeed, every later upload fails until disarmFailure(). */
  armFailure(n: number) {
    this.failAt = this.uploads + n;
  }
  disarmFailure() {
    this.failAt = null;
  }

  key(bucket: string, path: string) {
    return `${bucket}/${path}`;
  }

  async upload(bucket: string, path: string, data: Buffer, contentType: string): Promise<void> {
    this.uploads++;
    if (this.failAt !== null && this.uploads > this.failAt) {
      throw new Error('Simulated storage failure');
    }
    if (this.objects.has(this.key(bucket, path))) throw new Error('Object exists');
    this.objects.set(this.key(bucket, path), { data, contentType });
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    for (const p of paths) this.objects.delete(this.key(bucket, p));
  }

  async createSignedUrls(bucket: string, paths: string[], expiresInSeconds: number): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const p of paths) {
      if (!this.objects.has(this.key(bucket, p))) continue;
      this.signedPaths.push(this.key(bucket, p));
      out.set(p, `https://storage.test.invalid/object/sign/${bucket}/${p}?token=${randomBytes(8).toString('hex')}&expires=${expiresInSeconds}`);
    }
    return out;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  reset() {
    this.objects.clear();
    this.signedPaths.length = 0;
    this.failAt = null;
    this.uploads = 0;
  }
}

/** Test double for SMTP: records messages instead of sending them. */
export class FakeMailService {
  readonly sent: { to: string; subject: string; text: string }[] = [];
  configured = true;
  isConfigured() {
    return this.configured;
  }
  async send(m: { to: string; subject: string; text: string }) {
    this.sent.push(m);
  }
  async sendPasswordReset(to: string, _name: string, link: string) {
    this.sent.push({ to, subject: 'reset', text: link });
  }
}
