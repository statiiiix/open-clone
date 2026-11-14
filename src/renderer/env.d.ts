import type { OpenCloneApi } from '../shared/api';

declare global {
  interface Window {
    openclone: OpenCloneApi;
  }
}
