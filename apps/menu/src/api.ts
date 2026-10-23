import type {
  CrearPedidoInput,
  CuentaDetalle,
  MenuPublico,
  MesaPublica,
  PedidoDetalle,
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
  opciones: RequestInit & { sesion?: string } = {},
): Promise<T> {
  const { sesion, ...init } = opciones;
  let res: Response;
  try {
    res = await fetch(`${API}${ruta}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(sesion ? { Authorization: `Bearer ${sesion}` } : {}),
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
