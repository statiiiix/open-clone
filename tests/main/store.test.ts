import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { Store } from '../../src/main/store';

let root: string;
let store: Store;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-store-'));
  store = new Store(root);
});
const audio = (sec: number) => new Float32Array(24000 * sec).fill(0.25);
const item = (voiceId: string) => ({
  voiceId, voiceName: 'Me', text: 'Hello', expression: 'happy' as const,
  params: { intensity: 0.8, variation: 0.8 }, durationSec: 1.5,
});

it('creates, lists and persists voices', () => {
  const v = store.createVoice('  Me  ', audio(5));
  expect(v.name).toBe('Me');
  expect(store.listVoices()).toHaveLength(1);
  expect(fs.statSync(store.samplePathFor(v.id, 'neutral')).size).toBe(24000 * 5 * 4);
  expect(new Store(root).listVoices()[0].id).toBe(v.id);
});
it('names a blank voice and caps long names', () => {
  expect(store.createVoice('   ', audio(5)).name).toBe('Untitled voice');
  expect(store.createVoice('x'.repeat(200), audio(5)).name).toHaveLength(60);
});
it('uses an expression sample when present, else the main sample', () => {
  const v = store.createVoice('Me', audio(5));
  expect(store.samplePathFor(v.id, 'happy')).toMatch(/neutral\.f32$/);
  store.setExpressionSample(v.id, 'happy', audio(4));
  expect(store.samplePathFor(v.id, 'happy')).toMatch(/happy\.f32$/);
  const after = store.setExpressionSample(v.id, 'happy', null);
  expect(after.samples.happy).toBeUndefined();
  expect(store.samplePathFor(v.id, 'happy')).toMatch(/neutral\.f32$/);
  expect(fs.existsSync(path.join(root, 'voices', v.id, 'happy.f32'))).toBe(false);
});
it('will not remove the main sample', () => {
  const v = store.createVoice('Me', audio(5));
  expect(() => store.setExpressionSample(v.id, 'neutral', null)).toThrow();
});
it('renames and deletes voices, removing the sample folder', () => {
  const v = store.createVoice('Me', audio(5));
  expect(store.renameVoice(v.id, 'Narrator').name).toBe('Narrator');
  store.deleteVoice(v.id);
  expect(store.listVoices()).toEqual([]);
  expect(fs.existsSync(path.join(root, 'voices', v.id))).toBe(false);
});
it('throws a clear error for an unknown voice', () => {
  expect(() => store.samplePathFor('nope', 'neutral')).toThrow(/voice/i);
  expect(() => store.renameVoice('../../etc', 'x')).toThrow(/voice/i);
});
it('keeps history newest first and survives its voice being deleted', () => {
  const v = store.createVoice('Me', audio(5));
  const a = store.addHistory(item(v.id), new Uint8Array([1, 2, 3]));
  const b = store.addHistory(item(v.id), new Uint8Array([4, 5]));
  store.deleteVoice(v.id);
  const list = new Store(root).listHistory();
  expect(list.map((h) => h.id)).toEqual([b.id, a.id]);
  expect(fs.readFileSync(store.historyPath(a.id))).toEqual(Buffer.from([1, 2, 3]));
  store.deleteHistory(a.id);
  expect(store.listHistory()).toHaveLength(1);
  expect(fs.existsSync(path.join(root, 'history', a.file))).toBe(false);
});
it('sets aside a corrupt index and starts empty', () => {
  store.createVoice('Me', audio(5));
  fs.writeFileSync(path.join(root, 'voices', 'index.json'), '{not json');
  const fresh = new Store(root);
  expect(fresh.listVoices()).toEqual([]);
  expect(fs.readdirSync(path.join(root, 'voices')).some((f) => f.startsWith('index.corrupt-'))).toBe(true);
  expect(fresh.createVoice('Again', audio(5)).name).toBe('Again');
});
