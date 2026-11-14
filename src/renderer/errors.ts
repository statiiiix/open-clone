/** Electron prefixes errors that cross from the main process; show only our own sentence. */
export function messageOf(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
