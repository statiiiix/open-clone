import { contextBridge, ipcRenderer } from 'electron';
import type { OpenCloneApi } from '../shared/api';

const call = (channel: string) => (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const listen = (channel: string) => (cb: (...args: any[]) => void) => {
  const handler = (_: unknown, ...args: unknown[]) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => { ipcRenderer.removeListener(channel, handler); };
};

const api: OpenCloneApi = {
  model: { status: call('model:status'), size: call('model:size'), download: call('model:download'), onProgress: listen('model:progress') },
  voices: {
    list: call('voices:list'), create: call('voices:create'), setExpressionSample: call('voices:setExpressionSample'),
    rename: call('voices:rename'), remove: call('voices:remove'),
  },
  generate: { start: call('generate:start'), cancel: call('generate:cancel'), onProgress: listen('generate:progress') },
  history: { list: call('history:list'), remove: call('history:remove'), audio: call('history:audio'), saveAs: call('history:saveAs') },
};

contextBridge.exposeInMainWorld('openclone', api);
