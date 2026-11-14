import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ExpressionId, HistoryItem, Voice } from '../shared/types';

const MAX_NAME = 60;

/** A JSON list on disk. A file that cannot be parsed is set aside, never overwritten. */
class Index<T> {
  items: T[];
  constructor(private file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.items = this.read();
  }
  private read(): T[] {
    if (!fs.existsSync(this.file)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(data)) throw new Error('not a list');
      return data;
    } catch {
      const aside = path.join(path.dirname(this.file), `index.corrupt-${Date.now()}.json`);
      fs.renameSync(this.file, aside);
      return [];
    }
  }
  save(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.items, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

const cleanName = (name: string) => name.trim().slice(0, MAX_NAME) || 'Untitled voice';
const toBytes = (audio: Float32Array) => Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);

/** Voices and generation history under one root folder. */
export class Store {
  private voices: Index<Voice>;
  private history: Index<HistoryItem>;

  constructor(private root: string) {
    this.voices = new Index(path.join(root, 'voices', 'index.json'));
    this.history = new Index(path.join(root, 'history', 'index.json'));
  }

  private voice(id: string): Voice {
    const v = this.voices.items.find((x) => x.id === id);
    if (!v) throw new Error('That voice no longer exists.');
    return v;
  }
  private voiceDir(id: string) { return path.join(this.root, 'voices', id); }

  listVoices(): Voice[] { return this.voices.items; }

  createVoice(name: string, audio24k: Float32Array): Voice {
    const voice: Voice = { id: randomUUID(), name: cleanName(name), createdAt: new Date().toISOString(), samples: { neutral: 'neutral.f32' } };
    fs.mkdirSync(this.voiceDir(voice.id), { recursive: true });
    fs.writeFileSync(path.join(this.voiceDir(voice.id), 'neutral.f32'), toBytes(audio24k));
    this.voices.items.push(voice);
    this.voices.save();
    return voice;
  }

  setExpressionSample(voiceId: string, e: ExpressionId, audio24k: Float32Array | null): Voice {
    const voice = this.voice(voiceId);
    const file = path.join(this.voiceDir(voiceId), `${e}.f32`);
    if (audio24k) {
      fs.writeFileSync(file, toBytes(audio24k));
      voice.samples[e] = `${e}.f32`;
    } else {
      if (e === 'neutral') throw new Error('The main sample of a voice cannot be removed.');
      fs.rmSync(file, { force: true });
      delete voice.samples[e];
    }
    this.voices.save();
    return voice;
  }

  renameVoice(id: string, name: string): Voice {
    const voice = this.voice(id);
    voice.name = cleanName(name);
    this.voices.save();
    return voice;
  }

  deleteVoice(id: string): void {
    this.voice(id);
    this.voices.items = this.voices.items.filter((v) => v.id !== id);
    this.voices.save();
    fs.rmSync(this.voiceDir(id), { recursive: true, force: true });
  }

  samplePathFor(voiceId: string, e: ExpressionId): string {
    const voice = this.voice(voiceId);
    return path.join(this.voiceDir(voiceId), voice.samples[e] ?? voice.samples.neutral);
  }

  listHistory(): HistoryItem[] { return this.history.items; }

  addHistory(item: Omit<HistoryItem, 'id' | 'file' | 'createdAt'>, wav: Uint8Array): HistoryItem {
    const id = randomUUID();
    const full: HistoryItem = { ...item, id, file: `${id}.wav`, createdAt: new Date().toISOString() };
    fs.writeFileSync(path.join(this.root, 'history', full.file), wav);
    this.history.items.unshift(full);
    this.history.save();
    return full;
  }

  deleteHistory(id: string): void {
    const item = this.history.items.find((h) => h.id === id);
    if (!item) return;
    this.history.items = this.history.items.filter((h) => h.id !== id);
    this.history.save();
    fs.rmSync(path.join(this.root, 'history', item.file), { force: true });
  }

  historyPath(id: string): string {
    const item = this.history.items.find((h) => h.id === id);
    if (!item) throw new Error('That recording no longer exists.');
    return path.join(this.root, 'history', item.file);
  }
}
