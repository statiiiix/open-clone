import fs from 'node:fs';
import path from 'node:path';

export interface ModelFile { path: string; size: number }

export const MODEL_BASE_URL = 'https://huggingface.co/onnx-community/chatterbox-ONNX/resolve/main';
/** Language-model variant shipped with the app; chosen in the engine proof. */
export const LM_VARIANT = 'language_model_q4';

/** Exact byte sizes, so a partial or damaged file is never mistaken for a complete one. */
export const MODEL_FILES: ModelFile[] = [
  { path: 'tokenizer.json', size: 28543 },
  { path: 'tokenizer_config.json', size: 244 },
  { path: 'onnx/speech_encoder.onnx', size: 1184608 },
  { path: 'onnx/speech_encoder.onnx_data', size: 591274880 },
  { path: 'onnx/embed_tokens.onnx', size: 13286 },
  { path: 'onnx/embed_tokens.onnx_data', size: 61640704 },
  { path: 'onnx/language_model_q4.onnx', size: 227911 },
  { path: 'onnx/language_model_q4.onnx_data', size: 353621248 },
  { path: 'onnx/conditional_decoder.onnx', size: 6350448 },
  { path: 'onnx/conditional_decoder.onnx_data', size: 533970816 },
];

export function missingFiles(dir: string, files: ModelFile[] = MODEL_FILES): ModelFile[] {
  return files.filter((f) => {
    try { return fs.statSync(path.join(dir, f.path)).size !== f.size; } catch { return true; }
  });
}

const sizeOf = (file: string) => { try { return fs.statSync(file).size; } catch { return 0; } };

/**
 * Download whatever is missing. Each file is written to "<name>.part" and
 * renamed only once its size is right, so an interrupted run can resume.
 */
export async function ensureModel(
  dir: string,
  onProgress: (done: number, total: number) => void,
  fetchImpl: typeof fetch = fetch,
  files: ModelFile[] = MODEL_FILES,
  baseUrl: string = MODEL_BASE_URL,
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
