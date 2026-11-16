import { spawn } from 'node:child_process';

/**
 * Turn a WAV file into an MP3, using the encoder that ships inside the app's private Python.
 * Runs as a short process of its own, so it works while a generation is in progress.
 */
export function convertToMp3(
  engine: { python: string; script: string },
  wavPath: string,
  outPath: string,
  spawnImpl: typeof spawn = spawn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = () => reject(new Error('The MP3 could not be created. Try saving as WAV instead.'));
    const child = spawnImpl(engine.python, [engine.script, '--mp3', wavPath, outPath], { stdio: 'ignore' });
    child.on('error', failed);
    child.on('exit', (code) => (code === 0 ? resolve() : failed()));
  });
}
