import { useUIStore } from '../stores/uiStore.js';

/** Entry Images is switched on and its storage is set up and open: photos can be
 *  uploaded and shown. Everything that offers the person's own photos asks this. */
export function useImagesReady(): boolean {
  return useUIStore(s => s.imagesEnabled && s.imagesConfigured);
}
