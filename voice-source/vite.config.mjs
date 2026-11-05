import { defineConfig } from 'vite';
export default defineConfig({base:'./',build:{outDir:'voice-dist',emptyOutDir:true,rollupOptions:{input:'voice-entry.js',output:{entryFileNames:'voice-entry.js',chunkFileNames:'[name]-[hash].js',assetFileNames:'[name]-[hash][extname]'}}},worker:{format:'es'}});
