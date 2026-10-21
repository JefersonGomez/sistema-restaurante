import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Rol } from '@menu-qr/shared';
import { AuthProvider, useAuth } from './auth';
import { LoginPage } from './LoginPage';
import './index.css';

// Página vacía por rol (se llenan en la Fase 2).
const PANELES: Record<Rol, { ruta: string; titulo: string }> = {
  SUPERADMIN: { ruta: '/admin', titulo: 'Administración de restaurantes' },
  DUENO: { ruta: '/dueno', titulo: 'Panel del dueño' },
  MESERO: { ruta: '/mesero', titulo: 'Panel de meseros' },
  COCINA: { ruta: '/cocina', titulo: 'Pantalla de cocina' },
  CAJA: { ruta: '/caja', titulo: 'Caja' },
};

function Panel({ rol }: { rol: Rol }) {
  const { usuario, logout } = useAuth();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-4 bg-white px-4 py-3 shadow-sm">
        <div>
          <h1 className="font-semibold text-stone-800">{PANELES[rol].titulo}</h1>
          <p className="text-sm text-stone-500">
            {usuario?.nombre}
            {usuario?.restaurante ? ` · ${usuario.restaurante.nombre}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
        >
          Salir
        </button>
      </header>
      <main className="p-6 text-stone-500">Próximamente.</main>
    </div>
  );
}

function SoloRol({ rol, children }: { rol: Rol; children: ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol !== rol) return <Navigate to={PANELES[usuario.rol].ruta} replace />;
  return children;
}

function App() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <p className="p-6 text-stone-500">Cargando…</p>;
  const inicio = usuario ? PANELES[usuario.rol].ruta : '/login';
  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to={inicio} replace /> : <LoginPage />} />
      {(Object.keys(PANELES) as Rol[]).map((rol) => (
        <Route
          key={rol}
          path={PANELES[rol].ruta}
          element={
            <SoloRol rol={rol}>
              <Panel rol={rol} />
            </SoloRol>
          }
        />
      ))}
      <Route path="*" element={<Navigate to={inicio} replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
