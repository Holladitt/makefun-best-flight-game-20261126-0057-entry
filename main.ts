// MERIDIAN RUN — main.ts (bagian 1/2)
// Menyalin game/ + screenshots/ ke direktori output, lalu menulis dossier.json
// lewat dossier builder dari vendor/makefun-game.ts. Node 22, stdlib saja.
// Deterministik: tidak ada jam/tanggal/random di jalur penulisan dossier.
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const DOSSIER_OPTIONS = {
  text_max_bytes: 163840,
  screenshots_max: 4,
  screenshot_max_bytes: 262144,
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

async function main(): Promise<void> {
  const outDir = resolve(OUTPUT_DIR);
  await mkdir(outDir, { recursive: true });

  // Salin seluruh game/ dan screenshots/ yang ada di samping file ini.
  await cp(join(__dirname, 'game'), join(outDir, 'game'), { recursive: true });
  await cp(join(__dirname, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

  // Bangun dossier dari isi direktori output (game/ + screenshots/ yang tersalin).
  // buildDossier mengembalikan string, Uint8Array, atau objek biasa.
  const dossier = await buildDossier(outDir, DOSSIER_OPTIONS);
  let payload: string | Buffer;
  if (typeof dossier === 'string') {
    payload = dossier;
  } else if (dossier instanceof Uint8Array) {
    payload = Buffer.from(dossier);
  } else {
    payload = JSON.stringify(dossier, null, 2) + '\n';
  }
  await writeFile(join(outDir, 'dossier.json'), payload);
  const size = typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length;
  console.log(`dossier written: ${join(outDir, 'dossier.json')} (${size} bytes)`);
}

main().catch((err: unknown) => {
  console.error('main.ts failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

// Catatan: buildDossier dipanggil dengan direktori OUTPUT (bukan sumber),
// supaya dossier menggambarkan persis apa yang ikut ter-submit.
