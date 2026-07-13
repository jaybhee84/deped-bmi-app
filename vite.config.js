import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Required for Electron: when the packaged app loads dist/index.html via
  // file://, absolute asset paths ("/assets/...") resolve to the OS root
  // instead of the dist folder, causing a blank white screen. Relative
  // paths ("./assets/...") resolve correctly under file:// AND still work
  // fine under the Vite dev server, so this is safe for both modes.
  base: './',
})