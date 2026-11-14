import { useEffect, useState } from 'react';
import { messageOf } from '../errors';

const gb = (bytes: number) => (bytes / 1e9).toFixed(2);

/** First launch: fetch the voice model once, then the app works offline. */
export function ModelDownload({ onReady }: { onReady: () => void }) {
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const start = () => {
    setError(null);
    setRunning(true);
    window.openclone.model.download().then(onReady, (e) => { setError(messageOf(e)); setRunning(false); });
  };

  useEffect(() => {
    void window.openclone.model.size().then(setTotal);
    return window.openclone.model.onProgress((done, of) => setProgress([done, of]));
  }, []);

  const pct = progress ? Math.floor((progress[0] / Math.max(1, progress[1])) * 100) : 0;
  return (
    <div className="center-screen">
      <div className="card narrow">
        <h1>{running ? 'Downloading voice model' : 'One-time setup'}</h1>
        <p className="muted">
          Open Clone runs entirely on this Mac. It needs to download its voice model once ({gb(total)} GB). After that it works offline, and
          your voice never leaves this computer.
        </p>
        {running && (
          <>
            <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${pct}%` }} />
            </div>
            <p className="muted small">{progress ? `${gb(progress[0])} of ${gb(progress[1])} GB · ${pct}%` : 'Starting…'}</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        {!running && <button className="primary" onClick={start}>{error ? 'Retry' : 'Download'}</button>}
      </div>
    </div>
  );
}
