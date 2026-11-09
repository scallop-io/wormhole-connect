// Upload lib/ build output to Vercel Blob.
// Usage: bun run upload:blob [prefix]
// Token is loaded from scripts/.env (BLOB_READ_WRITE_TOKEN=...)
import { put } from '@vercel/blob';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const LIB_DIR = join(import.meta.dirname, '..', 'dist');
const PREFIX = (
  process.argv[2] ??
  process.env.BLOB_PREFIX ??
  'wormhole-connect'
).replace(/^\/+|\/+$/g, '');
const CONCURRENCY = 8;

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
    ),
  );
  return nested.flat();
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set');
  }

  const files = await listFiles(LIB_DIR).catch(() => {
    throw new Error(`${LIB_DIR} not found. Run "bun run build:lib" first`);
  });
  if (!files.length) throw new Error('lib/ is empty');

  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      const rel = relative(LIB_DIR, file).split(sep).join('/');
      const pathname = PREFIX ? `${PREFIX}/${rel}` : rel;
      try {
        const { url } = await put(pathname, await readFile(file), {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: true,
        });
        console.log(`✓ ${pathname} -> ${url}`);
      } catch (e) {
        failed++;
        console.error(`✗ ${pathname}: ${(e as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`Uploaded ${files.length - failed}/${files.length} files`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
