import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Outlet, Route, Routes, useParams } from 'react-router-dom';
import { useEnviarPedido } from './datos/acciones';
import { envioPendiente } from './datos/envio';
import { MesaProvider, useMesa } from './datos/mesa';
import {
  AppShell,
  BottomNav,
  ErrorScreen,
  EsqueletoMenu,
  SinConexion,
  ThankYouScreen,
  Toast,
} from './componentes/estructura';
import { useCarrito } from './estado/carrito';
import { useIdioma } from './estado/idioma';
import { pasoPedido, UiProvider } from '@menu-qr/ui';
import { AccountScreen } from './pantallas/AccountScreen';
import { CartScreen } from './pantallas/CartScreen';
import { MenuScreen } from './pantallas/MenuScreen';
import './index.css';

const queryClient = new QueryClient();

function Mesa() {
  const { estado, mesa, menu, cuenta, conectado, tokenQr, reintentar } = useMesa();
  const enCarrito = useCarrito((s) => s.lineas.reduce((n, l) => n + l.cantidad, 0));
  const enviar = useEnviarPedido();

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
  if (estado === 'cargando') return <EsqueletoMenu />;

  const sinEntregar = (cuenta?.pedidos ?? []).filter((p) => {
    const paso = pasoPedido(p);
    return paso !== null && paso < 4;
  }).length;
  return (
    <>
      {!conectado && <SinConexion />}
      <Outlet />
      <BottomNav base={`/m/${tokenQr}`} enCarrito={enCarrito} sinEntregar={sinEntregar} />
      <Toast />
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
