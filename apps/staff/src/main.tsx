import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Rol } from '@menu-qr/shared';
import { activarConPrimerToque } from './alertas';
import { AuthProvider, useAuth } from './auth';
import { AvisosGlobales } from './AvisosGlobales';
import { CajaPage } from './CajaPage';
import { EnLineaPage } from './EnLineaPage';
import { EstacionPage } from './EstacionPage';
import { LoginPage } from './LoginPage';
import { MeseroPage } from './MeseroPage';
import { Cargando, UiProvider } from '@menu-qr/ui';
import { InicioPage } from './panel/InicioPage';
import { MenuPanelPage } from './panel/menu/MenuPanelPage';
import { PlatoForm } from './panel/menu/PlatoForm';
import { PanelLayout } from './panel/PanelLayout';
import { AjustesPage } from './panel/AjustesPage';
import { MesasPage } from './panel/MesasPage';
import { PersonalPage } from './panel/PersonalPage';
import { CambiarPasswordPage } from './CambiarPasswordPage';
import { DispositivosPage } from './panel/DispositivosPage';
import { ReportesPage } from './panel/reportes/ReportesPage';
import { PersonalizarPage } from './panel/PersonalizarPage';
import { TabletPage } from './TabletPage';
import { RegistroPage } from './RegistroPage';
import { tokenTablet } from './api';
import { Encabezado } from './ui';
import './index.css';

// Pantalla de inicio por rol.
const INICIO: Record<Rol, string> = {
  SUPERADMIN: '/admin',
  DUENO: '/panel',
  MESERO: '/mesero',
  COCINA: '/cocina',
  CAJA: '/caja',
};

function Solo({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to={tokenTablet() ? '/tablet' : '/login'} replace />;
  if (!roles.includes(usuario.rol)) return <Navigate to={INICIO[usuario.rol]} replace />;
  return <div className="anim-entrar">{children}</div>;
}

function Admin() {
  return (
    <div className="min-h-dvh">
      <Encabezado titulo="Administración de restaurantes" />
      <main className="min-h-dvh bg-bg p-6 text-muted">Próximamente.</main>
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000 } } });

function App() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <Cargando texto="Cargando…" />;
  if (usuario?.debeCambiarPassword) return <CambiarPasswordPage />;
  // Una tablet vinculada vuelve a la pantalla de PIN, no al login con correo.
  const inicio = usuario ? INICIO[usuario.rol] : tokenTablet() ? '/tablet' : '/login';
  return (
    <>
      <AvisosGlobales />
      <Routes>
        <Route path="/login" element={usuario ? <Navigate to={inicio} replace /> : <LoginPage />} />
        <Route
          path="/tablet"
          element={usuario ? <Navigate to={inicio} replace /> : <TabletPage />}
        />
        <Route
          path="/registro"
          element={
            usuario ? <Navigate to="/panel/personalizar?bienvenida" replace /> : <RegistroPage />
          }
        />
        <Route
          path="/admin"
          element={
            <Solo roles={['SUPERADMIN']}>
              <Admin />
            </Solo>
          }
        />
        <Route
          path="/panel"
          element={
            <Solo roles={['DUENO']}>
              <PanelLayout />
            </Solo>
          }
        >
          <Route index element={<InicioPage />} />
          <Route path="menu" element={<MenuPanelPage />} />
          <Route path="menu/plato/:id" element={<PlatoForm />} />
          <Route path="mesas" element={<MesasPage />} />
          <Route path="personal" element={<PersonalPage />} />
          <Route path="ajustes" element={<AjustesPage />} />
          <Route path="personalizar" element={<PersonalizarPage />} />
          <Route path="dispositivos" element={<DispositivosPage />} />
          <Route path="reportes" element={<ReportesPage />} />
        </Route>
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
        <Route
          path="/en-linea"
          element={
            <Solo roles={['DUENO', 'CAJA', 'MESERO']}>
              <EnLineaPage />
            </Solo>
          }
        />
        <Route path="*" element={<Navigate to={inicio} replace />} />
      </Routes>
    </>
  );
}

activarConPrimerToque();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <UiProvider idioma="es">
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </UiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
