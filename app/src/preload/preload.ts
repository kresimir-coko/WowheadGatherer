import { contextBridge, ipcRenderer } from 'electron';
import type { PopupState } from '../shared/types';

/** All the popup page can do. */
const bridge = {
  onState(callback: (state: PopupState) => void): void {
    ipcRenderer.on('popup:state', (_event, state: PopupState) => callback(state));
  },
  close(): void {
    ipcRenderer.send('popup:close');
  },
  openWowhead(): void {
    ipcRenderer.send('popup:open-wowhead');
  },
  reportHeight(height: number): void {
    ipcRenderer.send('popup:height', height);
  },
};

export type GathererBridge = typeof bridge;

contextBridge.exposeInMainWorld('gatherer', bridge);
