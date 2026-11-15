/** Seconds left, judged from the sentences already finished. Null until one is done. */
export function estimateRemaining(doneChunks: number, of: number, elapsedSec: number): number | null {
  if (doneChunks <= 0 || of <= 0) return null;
  return Math.max(0, (elapsedSec / doneChunks) * (of - doneChunks));
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * What to show while generating. `progress` is [sentence being spoken, of]; `elapsedSec`
 * counts from when the first sentence started.
 */
export function progressLine(progress: [number, number] | null, elapsedSec: number): string {
  if (!progress) return 'Loading the voice model…';
  const [chunk, of] = progress;
  const head = of > 1 ? `Sentence ${chunk} of ${of}` : 'Generating';
  const left = estimateRemaining(chunk - 1, of, elapsedSec);
  const tail = left === null ? '' : ` · about ${Math.max(1, Math.round(left / 60))} min left`;
  return `${head} · ${clock(elapsedSec)} elapsed${tail}`;
}
