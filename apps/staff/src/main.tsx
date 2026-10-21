import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Rol } from '@menu-qr/shared';
import { AuthProvider, useAuth } from './auth';
import { CajaPage } from './CajaPage';
import { DuenoPage } from './DuenoPage';
import { EstacionPage } from './EstacionPage';
import { LoginPage } from './LoginPage';
import { MeseroPage } from './MeseroPage';
import { Encabezado } from './ui';
import './index.css';

// Pantalla de inicio por rol.
const INICIO: Record<Rol, string> = {
  SUPERADMIN: '/admin',
  DUENO: '/dueno',
  MESERO: '/mesero',
  COCINA: '/cocina',
  CAJA: '/caja',
};

function Solo({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (!roles.includes(usuario.rol)) return <Navigate to={INICIO[usuario.rol]} replace />;
  return children;
}

function Admin() {
  return (
    <div className="min-h-dvh">
      <Encabezado titulo="Administración de restaurantes" />
      <main className="p-6 text-stone-500">Próximamente.</main>
    </div>
  );
}

function App() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <p className="p-6 text-stone-500">Cargando…</p>;
  const inicio = usuario ? INICIO[usuario.rol] : '/login';
  return (
    <Routes>
      <Route path="/login" element={usuario ? <Navigate to={inicio} replace /> : <LoginPage />} />
      <Route
        path="/admin"
        element={
          <Solo roles={['SUPERADMIN']}>
            <Admin />
          </Solo>
        }
      />
      <Route
        path="/dueno"
        element={
          <Solo roles={['DUENO']}>
            <DuenoPage />
          </Solo>
        }
      />
      <Route
        path="/cocina"
        element={
          <Solo roles={['COCINA', 'DUENO']}>
            <EstacionPage />
          </Solo>
        }
      />
      <Route
        path="/mesero"
        element={
          <Solo roles={['MESERO', 'DUENO']}>
            <MeseroPage />
          </Solo>
        }
      />
      <Route
        path="/caja"
        element={
          <Solo roles={['CAJA', 'DUENO']}>
            <CajaPage />
          </Solo>
        }
      />
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
