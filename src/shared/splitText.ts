import { MAX_CHUNK_CHARS } from './types';

/** Break one over-long unit on `separator`, keeping the separator's punctuation with the left part. */
function breakOn(unit: string, separator: RegExp, maxChars: number): string[] {
  return unit.length <= maxChars ? [unit] : unit.split(separator).filter(Boolean);
}

/**
 * Split text into chunks the engine can speak in one go. Splits on sentence
 * ends, then commas, then spaces; never inside a word and never drops text.
 * Neighbouring pieces are merged again while they fit.
 */
export function splitText(text: string, maxChars: number = MAX_CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const pieces = clean
    .split(/(?<=[.!?])\s+/)
    .flatMap((s) => breakOn(s, /(?<=[,;:])\s+/, maxChars))
    .flatMap((s) => breakOn(s, /\s+/, maxChars));
  const chunks: string[] = [];
  for (const piece of pieces) {
    const last = chunks[chunks.length - 1];
    if (last !== undefined && last.length + 1 + piece.length <= maxChars) chunks[chunks.length - 1] = `${last} ${piece}`;
    else chunks.push(piece);
  }
  return chunks;
}
