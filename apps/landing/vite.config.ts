import { defineConfig } from 'vite';

// Landing de KitchaGo: página estática, sin React.
export default defineConfig({
  envDir: '../..', // usa el .env de la raíz (solo variables VITE_*)
  server: { port: 5182, strictPort: true },
  preview: { port: 5182, strictPort: true },
});
