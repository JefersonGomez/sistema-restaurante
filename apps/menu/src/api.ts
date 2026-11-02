import type {
  ClientePerfil,
  CrearPedidoInput,
  CuentaDetalle,
  MenuPublico,
  MesaPublica,
  PedidoDetalle,
  PedidoEnLineaInput,
  PerfilClienteInput,
  RegistroClienteInput,
  SeguimientoEnLinea,
  SesionClienteRegistrado,
} from '@menu-qr/shared';

export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// status 0 = error de red (se puede reintentar).
export class ErrorApi extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function llamar<T>(
  ruta: string,
  opciones: RequestInit & { sesion?: string; cliente?: string | null } = {},
): Promise<T> {
  const { sesion, cliente, ...init } = opciones;
  let res: Response;
  try {
    res = await fetch(`${API}${ruta}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(sesion ? { Authorization: `Bearer ${sesion}` } : {}),
        ...(cliente ? { 'X-Cliente': cliente } : {}),
      },
    });
  } catch {
    throw new ErrorApi(0, 'RED', 'Sin conexión');
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok)
    throw new ErrorApi(
      res.status,
      datos?.error?.code ?? 'ERROR',
      datos?.error?.message ?? 'Error',
      datos?.error?.details,
    );
  return datos as T;
}

// Abre u obtiene la cuenta de la mesa. Si hay sesión guardada la manda para reutilizarla.
export const abrirMesa = (tokenQr: string, sesion?: string | null) =>
  llamar<MesaPublica>(`/public/mesa/${encodeURIComponent(tokenQr)}`, {
    sesion: sesion ?? undefined,
  });

export const obtenerMenu = (slug: string) =>
  llamar<MenuPublico>(`/public/${encodeURIComponent(slug)}/menu`);

export const verCuenta = (sesion: string) => llamar<CuentaDetalle>('/public/cuenta', { sesion });

export const enviarPedido = (sesion: string, pedido: CrearPedidoInput) =>
  llamar<PedidoDetalle>('/public/cuenta/pedidos', {
    method: 'POST',
    sesion,
    body: JSON.stringify(pedido),
  });

export const llamarMesero = (sesion: string) =>
  llamar('/public/cuenta/llamar', {
    method: 'POST',
    sesion,
    body: JSON.stringify({ tipo: 'MESERO' }),
  });

export const pedirCuenta = (sesion: string) =>
  llamar('/public/cuenta/solicitar', { method: 'POST', sesion });

// Vista del detalle de un plato (anónima, para reportes). Si falla no importa.
export const registrarVista = (sesion: string, platoId: string) =>
  llamar(`/public/cuenta/vistas/${platoId}`, { method: 'POST', sesion }).catch(() => {});

// --- Personas por mesa e ingreso con el cupo lleno ---
export const fijarPersonas = (sesion: string, personas: number) =>
  llamar('/public/cuenta/personas', { method: 'POST', sesion, body: JSON.stringify({ personas }) });

export type Solicitud = { id: string; clave: string; expiraEn: string };
export type EstadoSolicitud =
  { estado: 'PENDIENTE' | 'RECHAZADA' | 'VENCIDA' } | { estado: 'ACEPTADA'; token: string };

export const pedirIngreso = (tokenQr: string) =>
  llamar<Solicitud>(`/public/mesa/${encodeURIComponent(tokenQr)}/ingreso`, { method: 'POST' });

export const estadoIngreso = (tokenQr: string, s: Solicitud) =>
  llamar<EstadoSolicitud>(`/public/mesa/${encodeURIComponent(tokenQr)}/ingreso/${s.id}`, {
    method: 'POST',
    body: JSON.stringify({ clave: s.clave }),
  });

export const responderIngreso = (sesion: string, id: string, aceptar: boolean) =>
  llamar(`/public/cuenta/ingresos/${id}`, {
    method: 'POST',
    sesion,
    body: JSON.stringify({ aceptar }),
  });

export const desbloquearIngreso = (sesion: string) =>
  llamar('/public/cuenta/desbloquear-ingreso', { method: 'POST', sesion });

// --- Pedidos en línea (sin mesa) ---
// Con la sesión de la cuenta del cliente (si tiene), el pedido queda en su cuenta.
export const pedirEnLinea = (slug: string, pedido: PedidoEnLineaInput, cliente?: string | null) =>
  llamar<{ token: string }>(`/public/${encodeURIComponent(slug)}/pedidos-en-linea`, {
    method: 'POST',
    cliente,
    body: JSON.stringify(pedido),
  });

// --- Cuenta del cliente (Fase 8): sesión en el encabezado X-Cliente ---
const rutaCliente = (slug: string, r: string) => `/public/${encodeURIComponent(slug)}/clientes${r}`;
export const registrarCliente = (slug: string, datos: RegistroClienteInput) =>
  llamar<SesionClienteRegistrado>(rutaCliente(slug, '/registro'), {
    method: 'POST',
    body: JSON.stringify(datos),
  });
export const entrarCliente = (slug: string, email: string, password: string) =>
  llamar<SesionClienteRegistrado>(rutaCliente(slug, '/entrar'), {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
export const perfilCliente = (slug: string, cliente: string) =>
  llamar<ClientePerfil>(rutaCliente(slug, '/yo'), { cliente });
export const guardarPerfil = (slug: string, cliente: string, datos: PerfilClienteInput) =>
  llamar<ClientePerfil>(rutaCliente(slug, '/yo'), {
    method: 'PUT',
    cliente,
    body: JSON.stringify(datos),
  });
export const cambiarContrasena = (slug: string, cliente: string, actual: string, nueva: string) =>
  llamar(rutaCliente(slug, '/yo/password'), {
    method: 'POST',
    cliente,
    body: JSON.stringify({ actual, nueva }),
  });
export const olvideCliente = (slug: string, email: string) =>
  llamar(rutaCliente(slug, '/olvide'), { method: 'POST', body: JSON.stringify({ email }) });
export const restablecerCliente = (slug: string, token: string, password: string) =>
  llamar(rutaCliente(slug, '/restablecer'), {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
export const salirCliente = (slug: string, cliente: string) =>
  llamar(rutaCliente(slug, '/salir'), { method: 'POST', cliente }).catch(() => {});

export const verSeguimiento = (token: string) =>
  llamar<SeguimientoEnLinea>(`/public/seguimiento/${encodeURIComponent(token)}`);
