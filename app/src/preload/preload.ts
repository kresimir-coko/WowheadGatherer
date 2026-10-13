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
  /** Opens a quest the page shows; the app checks it's one the page may open. */
  openQuest(id: number): void {
    ipcRenderer.send('popup:open-quest', id);
  },
  /** Goes back to the breadcrumb's page at index. */
  goBack(index: number): void {
    ipcRenderer.send('popup:go-back', index);
  },
  /** Opens one of the quest's Wowhead guides; the app checks the page on show lists it. */
  openGuide(index: number): void {
    ipcRenderer.send('popup:open-guide', index);
  },
  reportHeight(height: number): void {
    ipcRenderer.send('popup:height', height);
  },
};

export type GathererBridge = typeof bridge;

contextBridge.exposeInMainWorld('gatherer', bridge);
