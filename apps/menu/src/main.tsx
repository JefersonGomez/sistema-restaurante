import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useEnviarPedido } from './datos/acciones';
import { envioPendiente } from './datos/envio';
import { MesaProvider, useMesa } from './datos/mesa';
import {
  AppShell,
  BottomNav,
  ErrorScreen,
  SinConexion,
  ThankYouScreen,
  Toast,
} from './componentes/estructura';
import { useCarrito } from './estado/carrito';
import { useIdioma, useTextos } from './estado/idioma';
import { Cargando, pasoPedido, UiProvider } from '@menu-qr/ui';
import { MesaLlenaScreen, PersonasModal, SolicitudesIngreso } from './componentes/ingreso';
import { AccountScreen } from './pantallas/AccountScreen';
import { RutaEnLinea } from './pantallas/EnLinea';
import { Seguimiento } from './pantallas/Seguimiento';
import { CartScreen } from './pantallas/CartScreen';
import { MenuScreen } from './pantallas/MenuScreen';
import './index.css';

const queryClient = new QueryClient();

function Mesa() {
  const { estado, mesa, menu, cuenta, conectado, tokenQr, reintentar } = useMesa();
  const enCarrito = useCarrito((s) => s.lineas.reduce((n, l) => n + l.cantidad, 0));
  const enviar = useEnviarPedido();
  const t = useTextos();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!menu) return;
    document.title = menu.restaurante.nombre;
    // Color propio del restaurante (validado con contraste suficiente para texto blanco).
    const acento = menu.restaurante.colorAcento;
    const raiz = document.documentElement.style;
    if (acento) {
      raiz.setProperty('--purple', acento);
      raiz.setProperty('--purple-soft', `color-mix(in srgb, ${acento} 14%, transparent)`);
    }
  }, [menu]);

  // Si quedó un envío a medias (se cayó la red o se recargó la página), se reintenta solo.
  const reanudado = useRef(false);
  useEffect(() => {
    if (estado === 'listo' && mesa && !reanudado.current) {
      reanudado.current = true;
      if (envioPendiente(mesa.cuentaId)) enviar();
    }
  }, [estado, mesa, enviar]);

  if (estado === 'cerrada') return <ThankYouScreen />;
  if (estado === 'noEncontrado') return <ErrorScreen tipo="noEncontrado" />;
  if (estado === 'error') return <ErrorScreen tipo="error" onReintentar={reintentar} />;
  if (estado === 'llena') return <MesaLlenaScreen />;
  if (estado === 'cargando') return <Cargando texto={t.cargandoMenu} />;

  const sinEntregar = (cuenta?.pedidos ?? []).filter((p) => {
    const paso = pasoPedido(p);
    return paso !== null && paso < 4;
  }).length;
  return (
    <>
      {!conectado && <SinConexion />}
      {/* Cada pantalla entra con una transición suave. */}
      <div key={pathname} className="anim-entrar flex flex-1 flex-col">
        <Outlet />
      </div>
      <BottomNav base={`/m/${tokenQr}`} enCarrito={enCarrito} sinEntregar={sinEntregar} />
      <Toast />
      {/* El primero que escanea dice cuántos son; los de la mesa aceptan a quien pide unirse. */}
      {cuenta && cuenta.personas === null && <PersonasModal />}
      <SolicitudesIngreso />
    </>
  );
}

function RutaMesa() {
  const { token = '' } = useParams();
  return (
    <MesaProvider key={token} tokenQr={token}>
      <Mesa />
    </MesaProvider>
  );
}

function App() {
  const idioma = useIdioma((s) => s.idioma);
  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);
  return (
    <UiProvider idioma={idioma}>
      <AppShell>
        <Routes>
          <Route path="/m/:token" element={<RutaMesa />}>
            <Route index element={<MenuScreen />} />
            <Route path="carrito" element={<CartScreen />} />
            <Route path="cuenta" element={<AccountScreen />} />
          </Route>
          {/* Pedidos en línea (sin mesa) y su seguimiento. */}
          <Route path="/r/:slug/*" element={<RutaEnLinea />} />
          <Route path="/seguimiento/:token" element={<Seguimiento />} />
          <Route path="*" element={<ErrorScreen tipo="sinMesa" />} />
        </Routes>
      </AppShell>
    </UiProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
