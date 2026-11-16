import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CANCELLED, type GenerateRequest } from '../shared/api';
import { PRESETS } from '../shared/presets';
import { buildRecipe } from '../shared/recipe';
import { splitText } from '../shared/splitText';
import { SAMPLE_RATE, type ExpressionId, type Voice } from '../shared/types';
import { encodeWav } from '../shared/wav';
import { CancelledError, EngineHost, type EnginePaths } from './engineHost';
import { convertToMp3 } from './mp3';
import { ensureModels, MODEL_SETS, missingSets, totalSize } from './modelDownload';
import { Store } from './store';

const MAX_TEXT_CHARS = 5000;
const MIN_VOICE_SAMPLE = 60 * SAMPLE_RATE;
const MIN_EXPRESSION_SAMPLE = 10 * SAMPLE_RATE;
const MAX_SAMPLE = 60 * SAMPLE_RATE;

let win: BrowserWindow | null = null;
const send = (channel: string, ...args: unknown[]) => { if (win && !win.isDestroyed()) win.webContents.send(channel, ...args); };

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 900, minHeight: 600,
    backgroundColor: '#ffffff', title: 'Open Clone', titleBarStyle: 'hiddenInset', show: false,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => win?.show());
  // The window only ever shows the app itself.
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function isExpression(e: unknown): e is ExpressionId { return typeof e === 'string' && e in PRESETS; }
function checkAudio(a: unknown, min: number): Float32Array {
  if (!(a instanceof Float32Array) || a.length < min || a.length > MAX_SAMPLE) throw new Error(`That sample cannot be used. Use ${min / SAMPLE_RATE} to 60 seconds of audio.`);
  return a;
}

/** Where the voice engine lives: inside the app once packaged, in the project folder during development. */
function enginePaths(root: string): EnginePaths {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return {
    python: app.isPackaged ? path.join(base, 'python', 'bin', 'python3') : process.env.OPENCLONE_PYTHON ?? path.join(base, 'build', `python-${process.arch}`, 'bin', 'python3'),
    script: app.isPackaged ? path.join(base, 'engine', 'engine.py') : path.join(base, 'python', 'engine.py'),
    modelDir: path.join(root, MODEL_SETS[0].dir),
    whisperDir: path.join(root, MODEL_SETS[1].dir),
  };
}

function wire(): void {
  const root = app.getPath('userData');
  const store = new Store(root);
  const paths = enginePaths(root);
  const engine = new EngineHost(paths);
  let downloading: Promise<void> | null = null;
  let cancelWanted = false;
  app.on('before-quit', () => engine.dispose());
  // The first version's voice model is no longer used.
  void fs.promises.rm(path.join(root, 'models', 'chatterbox'), { recursive: true, force: true }).catch(() => {});

  /** Write down the words in one of a voice's samples; the voice model continues from them. */
  const transcribeSample = async (voiceId: string, e: ExpressionId): Promise<Voice> => {
    const text = (await engine.transcribe(store.samplePathFor(voiceId, e))).trim();
    if (!text) throw new Error('No speech could be heard in that sample. Record or choose another one.');
    return store.setTranscript(voiceId, e, text);
  };
  const notWhileGenerating = () => {
    if (engine.busy) throw new Error('Wait for the current generation to finish, then save the sample.');
  };

  ipcMain.handle('system:slowEngine', () => process.arch === 'x64');

  ipcMain.handle('model:status', () => {
    if (missingSets(root).length) return 'missing';
    engine.warm();
    return 'ready';
  });
  ipcMain.handle('model:size', () => totalSize());
  ipcMain.handle('model:download', () => {
    downloading ??= ensureModels(root, (done, total) => send('model:progress', done, total))
      .then(() => engine.warm())
      .finally(() => { downloading = null; });
    return downloading;
  });

  ipcMain.handle('voices:list', () => store.listVoices());
  ipcMain.handle('voices:create', async (_, name: unknown, audio: unknown) => {
    notWhileGenerating();
    const voice = store.createVoice(String(name ?? ''), checkAudio(audio, MIN_VOICE_SAMPLE));
    try {
      return await transcribeSample(voice.id, 'neutral');
    } catch (err) {
      store.deleteVoice(voice.id);
      throw err;
    }
  });
  ipcMain.handle('voices:setExpressionSample', async (_, id: unknown, e: unknown, audio: unknown) => {
    if (!isExpression(e)) throw new Error('Unknown expression.');
    if (audio === null) return store.setExpressionSample(String(id), e, null);
    notWhileGenerating();
    store.setExpressionSample(String(id), e, checkAudio(audio, MIN_EXPRESSION_SAMPLE));
    try {
      return await transcribeSample(String(id), e);
    } catch (err) {
      if (e !== 'neutral') store.setExpressionSample(String(id), e, null);
      throw err;
    }
  });
  ipcMain.handle('voices:rename', (_, id: unknown, name: unknown) => store.renameVoice(String(id), String(name ?? '')));
  ipcMain.handle('voices:remove', (_, id: unknown) => store.deleteVoice(String(id)));

  ipcMain.handle('generate:start', async (_, req: GenerateRequest) => {
    const text = String(req?.text ?? '');
    if (text.length > MAX_TEXT_CHARS) throw new Error(`That text is too long. The limit is ${MAX_TEXT_CHARS} characters at a time.`);
    const chunks = splitText(text);
    if (chunks.length === 0) throw new Error('Type something for your voice to say.');
    if (!isExpression(req.expression)) throw new Error('Unknown expression.');
    const expression = req.expression;
    let voice = store.listVoices().find((v) => v.id === req.voiceId);
    if (!voice) throw new Error('That voice no longer exists.');
    if (engine.busy) throw new Error('Another generation is already running.');
    cancelWanted = false;
    const outPath = path.join(root, 'history', `.pending-${randomUUID()}.f32`);
    try {
      // Voices saved by the first version have no transcript yet.
      const own = expression !== 'neutral' && voice.samples[expression] ? expression : 'neutral';
      if (!voice.transcripts?.[own]?.trim()) voice = await transcribeSample(voice.id, own);
      if (cancelWanted) throw new CancelledError();
      const voiceId = voice.id;
      const recipe = buildRecipe(voice, expression, (file) => store.sampleFile(voiceId, file));
      const { sampleRate, samples } = await engine.generate({ chunks, ...recipe, outPath }, (chunk, of) => send('generate:progress', chunk, of));
      if (samples === 0) throw new Error('The voice engine produced no audio for that text. Try rephrasing it.');
      const audio = new Float32Array(new Uint8Array(await fs.promises.readFile(outPath)).buffer);
      return store.addHistory(
        { voiceId: voice.id, voiceName: voice.name, text, expression, durationSec: samples / sampleRate },
        encodeWav(audio, sampleRate),
      );
    } catch (err) {
      if (err instanceof CancelledError) throw new Error(CANCELLED);
      throw err;
    } finally {
      fs.rmSync(outPath, { force: true });
    }
  });
  ipcMain.handle('generate:cancel', () => { cancelWanted = true; engine.cancel(); });

  ipcMain.handle('history:list', () => store.listHistory());
  ipcMain.handle('history:remove', (_, id: unknown) => store.deleteHistory(String(id)));
  ipcMain.handle('history:audio', (_, id: unknown) => fs.promises.readFile(store.historyPath(String(id))));
  ipcMain.handle('history:saveAs', async (_, id: unknown) => {
    const item = store.listHistory().find((h) => h.id === id);
    if (!item || !win) return false;
    const slug = item.text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').slice(0, 6).join('-').toLowerCase() || 'open-clone';
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: `${slug}.mp3`,
      filters: [{ name: 'MP3 audio', extensions: ['mp3'] }, { name: 'WAV audio (uncompressed)', extensions: ['wav'] }],
    });
    if (canceled || !filePath) return false;
    // The file name's ending decides the format.
    if (filePath.toLowerCase().endsWith('.wav')) await fs.promises.copyFile(store.historyPath(item.id), filePath);
    else await convertToMp3(paths, store.historyPath(item.id), filePath.toLowerCase().endsWith('.mp3') ? filePath : `${filePath}.mp3`);
    return true;
  });
}

app.whenReady().then(() => {
  wire();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
