import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
import { convertToMp3 } from '../../src/main/mp3';

function fakeSpawn(code: number | null, fail = false) {
  return vi.fn(() => {
    const child = new EventEmitter();
    queueMicrotask(() => (fail ? child.emit('error', new Error('ENOENT')) : child.emit('exit', code)));
    return child;
  });
}

test('asks the private Python to convert the file', async () => {
  const spawn = fakeSpawn(0);
  await convertToMp3({ python: '/py', script: '/engine.py' }, '/in.wav', '/out.mp3', spawn as any);
  expect(spawn).toHaveBeenCalledWith('/py', ['/engine.py', '--mp3', '/in.wav', '/out.mp3'], expect.anything());
});

test('a failed conversion is reported plainly', async () => {
  await expect(convertToMp3({ python: '/py', script: '/e.py' }, '/in.wav', '/out.mp3', fakeSpawn(1) as any)).rejects.toThrow('The MP3 could not be created. Try saving as WAV instead.');
  await expect(convertToMp3({ python: '/py', script: '/e.py' }, '/in.wav', '/out.mp3', fakeSpawn(null, true) as any)).rejects.toThrow('The MP3 could not be created. Try saving as WAV instead.');
});
