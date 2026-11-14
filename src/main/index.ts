import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { CANCELLED, type GenerateRequest } from '../shared/api';
import { clampParams, PRESETS } from '../shared/presets';
import { splitText } from '../shared/splitText';
import { SAMPLE_RATE, type ExpressionId } from '../shared/types';
import { encodeWav } from '../shared/wav';
import { CancelledError, EngineHost } from './engineHost';
import { ensureModel, LM_VARIANT, missingFiles, MODEL_FILES } from './modelDownload';
import { Store } from './store';

const MAX_TEXT_CHARS = 5000;
const MIN_SAMPLE = 3 * SAMPLE_RATE;
const MAX_SAMPLE = 30 * SAMPLE_RATE;

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
function checkAudio(a: unknown): Float32Array {
  if (!(a instanceof Float32Array) || a.length < MIN_SAMPLE || a.length > MAX_SAMPLE) throw new Error('That sample cannot be used. Use 3 to 30 seconds of audio.');
  return a;
}

function wire(): void {
  const root = app.getPath('userData');
  const modelDir = path.join(root, 'models', 'chatterbox');
  const store = new Store(root);
  const engine = new EngineHost(path.join(__dirname, 'worker.js'), modelDir, LM_VARIANT);
  let downloading: Promise<void> | null = null;
  app.on('before-quit', () => engine.dispose());

  ipcMain.handle('model:status', () => (missingFiles(modelDir).length ? 'missing' : 'ready'));
  ipcMain.handle('model:size', () => MODEL_FILES.reduce((n, f) => n + f.size, 0));
  ipcMain.handle('model:download', () => {
    downloading ??= ensureModel(modelDir, (done, total) => send('model:progress', done, total)).finally(() => { downloading = null; });
    return downloading;
  });

  ipcMain.handle('voices:list', () => store.listVoices());
  ipcMain.handle('voices:create', (_, name: unknown, audio: unknown) => store.createVoice(String(name ?? ''), checkAudio(audio)));
  ipcMain.handle('voices:setExpressionSample', (_, id: unknown, e: unknown, audio: unknown) => {
    if (!isExpression(e)) throw new Error('Unknown expression.');
    return store.setExpressionSample(String(id), e, audio === null ? null : checkAudio(audio));
  });
  ipcMain.handle('voices:rename', (_, id: unknown, name: unknown) => store.renameVoice(String(id), String(name ?? '')));
  ipcMain.handle('voices:remove', (_, id: unknown) => store.deleteVoice(String(id)));

  ipcMain.handle('generate:start', async (_, req: GenerateRequest) => {
    const text = String(req?.text ?? '');
    if (text.length > MAX_TEXT_CHARS) throw new Error(`That text is too long. The limit is ${MAX_TEXT_CHARS} characters at a time.`);
    const chunks = splitText(text);
    if (chunks.length === 0) throw new Error('Type something for your voice to say.');
    if (!isExpression(req.expression)) throw new Error('Unknown expression.');
    const params = clampParams(req.params ?? PRESETS[req.expression]);
    const voice = store.listVoices().find((v) => v.id === req.voiceId);
    if (!voice) throw new Error('That voice no longer exists.');
    try {
      const samples = await engine.generate(chunks, store.samplePathFor(voice.id, req.expression), params, (chunk, of) => send('generate:progress', chunk, of));
      if (samples.length === 0) throw new Error('The voice engine produced no audio for that text. Try rephrasing it.');
      return store.addHistory(
        { voiceId: voice.id, voiceName: voice.name, text, expression: req.expression, params, durationSec: samples.length / SAMPLE_RATE },
        encodeWav(samples),
      );
    } catch (err) {
      if (err instanceof CancelledError) throw new Error(CANCELLED);
      throw err;
    }
  });
  ipcMain.handle('generate:cancel', () => engine.cancel());

  ipcMain.handle('history:list', () => store.listHistory());
  ipcMain.handle('history:remove', (_, id: unknown) => store.deleteHistory(String(id)));
  ipcMain.handle('history:audio', (_, id: unknown) => fs.promises.readFile(store.historyPath(String(id))));
  ipcMain.handle('history:saveAs', async (_, id: unknown) => {
    const item = store.listHistory().find((h) => h.id === id);
    if (!item || !win) return false;
    const slug = item.text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').slice(0, 6).join('-').toLowerCase() || 'open-clone';
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `${slug}.wav`, filters: [{ name: 'WAV audio', extensions: ['wav'] }] });
    if (canceled || !filePath) return false;
    await fs.promises.copyFile(store.historyPath(item.id), filePath);
    return true;
  });
}

app.whenReady().then(() => {
  wire();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
