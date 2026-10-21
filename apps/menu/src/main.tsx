import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { MenuPage } from './MenuPage';
import './index.css';

function SinMesa() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center text-stone-600">
      <p>Escaneá el código QR de tu mesa para ver el menú.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/m/:token" element={<MenuPage />} />
        <Route path="*" element={<SinMesa />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
