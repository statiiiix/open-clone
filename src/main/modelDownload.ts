import fs from 'node:fs';
import path from 'node:path';

export interface ModelFile { path: string; size: number }

export interface ModelSet { /** folder under the app's data folder */ dir: string; baseUrl: string; files: ModelFile[] }

const HF = 'https://huggingface.co';

/**
 * What the app downloads on first launch. Revisions are pinned, and sizes are exact, so a
 * partial or damaged file is never mistaken for a complete one.
 */
export const MODEL_SETS: ModelSet[] = [
  {
    // The voice model.
    dir: 'models/voxcpm2',
    baseUrl: `${HF}/openbmb/VoxCPM2/resolve/7936080b41163874f38610f46f438e2c0757f9fd`,
    files: [
      { path: 'config.json', size: 4336 },
      { path: 'tokenizer.json', size: 3676772 },
      { path: 'tokenizer_config.json', size: 5059 },
      { path: 'special_tokens_map.json', size: 1632 },
      { path: 'tokenization_voxcpm2.py', size: 2895 },
      { path: 'audiovae.pth', size: 376951122 },
      { path: 'model.safetensors', size: 4580080592 },
    ],
  },
  {
    // Writes down the words in a voice sample, which the voice model needs.
    dir: 'models/whisper-small.en',
    baseUrl: `${HF}/Systran/faster-whisper-small.en/resolve/d1d751a5f8271d482d14ca55d9e2deeebbae577f`,
    files: [
      { path: 'config.json', size: 2657 },
      { path: 'tokenizer.json', size: 2128466 },
      { path: 'vocabulary.txt', size: 422309 },
      { path: 'model.bin', size: 483545366 },
    ],
  },
];

const sizeOfSet = (set: ModelSet) => set.files.reduce((n, f) => n + f.size, 0);
export const totalSize = (sets: ModelSet[] = MODEL_SETS) => sets.reduce((n, s) => n + sizeOfSet(s), 0);

export function missingSets(root: string, sets: ModelSet[] = MODEL_SETS): ModelSet[] {
  return sets.filter((s) => missingFiles(path.join(root, s.dir), s.files).length > 0);
}

/** Download every set that is incomplete, reporting one combined progress. */
export async function ensureModels(
  root: string,
  onProgress: (done: number, total: number) => void,
  fetchImpl: typeof fetch = fetch,
  sets: ModelSet[] = MODEL_SETS,
): Promise<void> {
  const total = totalSize(sets);
  const have = (upTo: number) => sets.slice(upTo).reduce((n, s) => n + sizeOfSet(s) - missingFiles(path.join(root, s.dir), s.files).reduce((m, f) => m + f.size, 0), 0);
  let before = 0;
  for (let i = 0; i < sets.length; i++) {
    const later = have(i + 1); // already on disk in the sets still to come
    await ensureModel(path.join(root, sets[i].dir), (done) => onProgress(Math.min(before + done + later, total), total), fetchImpl, sets[i].files, sets[i].baseUrl);
    before += sizeOfSet(sets[i]);
  }
}

export function missingFiles(dir: string, files: ModelFile[]): ModelFile[] {
  return files.filter((f) => {
    try { return fs.statSync(path.join(dir, f.path)).size !== f.size; } catch { return true; }
  });
}

const sizeOf = (file: string) => { try { return fs.statSync(file).size; } catch { return 0; } };

/**
 * Download whatever is missing from one folder. Each file is written to "<name>.part" and
 * renamed only once its size is right, so an interrupted run can resume.
 */
export async function ensureModel(
  dir: string,
  onProgress: (done: number, total: number) => void,
  fetchImpl: typeof fetch,
  files: ModelFile[],
  baseUrl: string,
): Promise<void> {
  const total = files.reduce((n, f) => n + f.size, 0);
  const todo = missingFiles(dir, files);
  let done = total - todo.reduce((n, f) => n + f.size, 0);
  onProgress(done, total);

  for (const f of todo) {
    const final = path.join(dir, f.path);
    const part = `${final}.part`;
    fs.mkdirSync(path.dirname(final), { recursive: true });
    let have = sizeOf(part);
    if (have >= f.size) { fs.rmSync(part, { force: true }); have = 0; }

    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/${f.path}`, have ? { headers: { Range: `bytes=${have}-` } } : undefined);
    } catch {
      throw new Error('Could not reach the download server. Check your internet connection and try again.');
    }
    if (res.status === 200 && have) { fs.rmSync(part, { force: true }); have = 0; } // server ignored the resume
    else if (res.status !== 200 && res.status !== 206) throw new Error(`The download server answered with an error (${res.status}). Try again later.`);
    if (!res.body) throw new Error('The download server sent an empty answer. Try again.');

    done += have;
    const out = fs.openSync(part, 'a');
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        fs.writeSync(out, value);
        done += value.length;
        onProgress(Math.min(done, total), total);
      }
    } catch {
      throw new Error('The connection dropped during the download. Try again and it will continue where it stopped.');
    } finally {
      fs.closeSync(out);
    }
    const got = sizeOf(part);
    if (got !== f.size) {
      fs.rmSync(part, { force: true });
      throw new Error(`Downloaded file ${f.path} has the wrong size (${got} instead of ${f.size}). Try again.`);
    }
    fs.renameSync(part, final);
  }
  onProgress(total, total);
}
