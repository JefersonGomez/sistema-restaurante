import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Rol } from '@menu-qr/shared';
import { activarConPrimerToque } from './alertas';
import { AuthProvider, useAuth } from './auth';
import { AvisosGlobales } from './AvisosGlobales';
import { AvisoConexion } from './sinConexion';
import { CajaPage } from './CajaPage';
import { ComprobantesCajaPage, RepartidoresCajaPage } from './CajaExtras';
import { EnLineaPage } from './EnLineaPage';
import { EstacionPage } from './EstacionPage';
import { LoginPage } from './LoginPage';
import { DemoPage, FranjaDemo } from './DemoPage';
import { MeseroPage } from './MeseroPage';
import { Cargando, UiProvider } from '@menu-qr/ui';
import { InicioPage } from './panel/InicioPage';
import { MenuPanelPage } from './panel/menu/MenuPanelPage';
import { PlatoForm } from './panel/menu/PlatoForm';
import { PanelLayout } from './panel/PanelLayout';
import { AjustesPage } from './panel/AjustesPage';
import { MesasPage } from './panel/MesasPage';
import { PersonalPage } from './panel/PersonalPage';
import { ClientesPage } from './panel/ClientesPage';
import { CambiarPasswordPage } from './CambiarPasswordPage';
import { DispositivosPage } from './panel/DispositivosPage';
import { ReportesPage } from './panel/reportes/ReportesPage';
import { PersonalizarPage } from './panel/PersonalizarPage';
import { TabletPage } from './TabletPage';
import { RegistroPage } from './RegistroPage';
import { AdminPage } from './AdminPage';
import { OlvidePage, RestablecerPage } from './RecuperarPage';
import { RepartosPage } from './RepartosPage';
import { tokenTablet } from './api';
import './index.css';
import { Dialogos } from './dialogos';

// Pantalla de inicio por rol.
const INICIO: Record<Rol, string> = {
  SUPERADMIN: '/admin',
  DUENO: '/panel',
  MESERO: '/mesero',
  COCINA: '/cocina',
  CAJA: '/caja',
  REPARTIDOR: '/repartos',
};

function Solo({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to={tokenTablet() ? '/tablet' : '/login'} replace />;
  if (!roles.includes(usuario.rol)) return <Navigate to={INICIO[usuario.rol]} replace />;
  return <div className="anim-entrar">{children}</div>;
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
      {usuario?.restaurante?.esDemo && <FranjaDemo />}
      <AvisosGlobales />
      <Dialogos />
      {usuario && <AvisoConexion />}
      <Routes>
        <Route path="/login" element={usuario ? <Navigate to={inicio} replace /> : <LoginPage />} />
        <Route path="/demo" element={usuario ? <Navigate to={inicio} replace /> : <DemoPage />} />
        <Route path="/olvide" element={<OlvidePage />} />
        <Route path="/restablecer" element={<RestablecerPage />} />
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
              <AdminPage />
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
          <Route path="clientes" element={<ClientesPage />} />
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
          path="/caja/comprobantes"
          element={
            <Solo roles={['CAJA', 'DUENO']}>
              <ComprobantesCajaPage />
            </Solo>
          }
        />
        <Route
          path="/caja/repartidores"
          element={
            <Solo roles={['CAJA', 'DUENO']}>
              <RepartidoresCajaPage />
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
        <Route
          path="/repartos"
          element={
            <Solo roles={['REPARTIDOR']}>
              <RepartosPage />
            </Solo>
          }
        />
        <Route path="*" element={<Navigate to={inicio} replace />} />
      </Routes>
    </>
  );
}

activarConPrimerToque();

// Fase 18.3: la aplicación queda guardada en el equipo y abre aunque se recargue sin internet.
// Solo en producción (en desarrollo interferiría con la recarga en caliente). Requiere HTTPS o
// localhost.
// Se usa MODE (el modo del build) y no PROD: con NODE_ENV=development en el .env, PROD es false.
if (import.meta.env.MODE === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(async () => {
        const sw = (await navigator.serviceWorker.ready).active;
        // Lo que se cargó antes de que el service worker controlara la página.
        const urls = performance
          .getEntriesByType('resource')
          .map((r) => r.name)
          .concat(location.origin + '/');
        sw?.postMessage({ tipo: 'guardar', urls });
      })
      .catch(() => {});
  });
}

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
