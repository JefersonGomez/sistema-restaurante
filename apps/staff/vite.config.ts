import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../..', // usa el .env de la raíz (solo variables VITE_*)
  server: { port: 5181, strictPort: true },
  preview: { port: 5181, strictPort: true },
});
