import { z } from 'zod';

export const rolSchema = z.enum(['SUPERADMIN', 'DUENO', 'MESERO', 'COCINA', 'CAJA']);
export type Rol = z.infer<typeof rolSchema>;

export const monedaSchema = z.enum(['CRC', 'USD']);
export type Moneda = z.infer<typeof monedaSchema>;

export const idiomaSchema = z.enum(['es', 'en']);
export type Idioma = z.infer<typeof idiomaSchema>;

// --- Piezas comunes ---
// Sin .default() en los esquemas: con .partial() se aplicarían también al actualizar.
// Los valores por defecto los pone la base de datos.

const texto = (max = 120) => z.string().trim().min(1).max(max);
const textoOpcional = (max = 500) => z.string().trim().max(max).nullable().optional();
const urlOpcional = z.url().max(500).nullable().optional();
const centimos = z.number().int().min(0).max(1_000_000_000);
const porcentaje = z.number().int().min(0).max(100);
const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().min(8).max(200);

export const idParamSchema = z.object({ id: z.uuid() });

// --- Auth ---

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

// --- Restaurante ---

export const modoConfirmacionSchema = z.enum(['SIEMPRE', 'PRIMER_PEDIDO', 'NUNCA']);
export type ModoConfirmacion = z.infer<typeof modoConfirmacionSchema>;

export const restauranteConfigSchema = z
  .object({
    nombre: texto(),
    logoUrl: urlOpcional,
    colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hex, ej. #0f766e'),
    moneda: monedaSchema,
    idiomas: z.array(idiomaSchema).min(1).max(2),
    porcentajeIva: porcentaje,
    porcentajeServicio: porcentaje,
    preciosIncluyenImpuestos: z.boolean(),
    modoConfirmacion: modoConfirmacionSchema,
  })
  .partial();
export type RestauranteConfigInput = z.infer<typeof restauranteConfigSchema>;

export const crearRestauranteSchema = z.object({
  restaurante: z.object({
    nombre: texto(),
    slug: z
      .string()
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Solo minúsculas, números y guiones'),
    moneda: monedaSchema.optional(),
    plan: texto(40).optional(),
  }),
  dueno: z.object({ nombre: texto(), email, password }),
});
export type CrearRestauranteInput = z.infer<typeof crearRestauranteSchema>;

export const adminRestaurantePatchSchema = z
  .object({ activo: z.boolean(), plan: texto(40) })
  .partial();
export type AdminRestaurantePatchInput = z.infer<typeof adminRestaurantePatchSchema>;

// --- Usuarios (personal del restaurante) ---

export const rolPersonalSchema = z.enum(['DUENO', 'MESERO', 'COCINA', 'CAJA']);

export const crearUsuarioSchema = z.object({
  nombre: texto(),
  email,
  password,
  rol: rolPersonalSchema,
  estacionId: z.uuid().nullable().optional(), // COCINA: su estación; null = todas
});
export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>;

export const actualizarUsuarioSchema = crearUsuarioSchema.extend({ activo: z.boolean() }).partial();
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>;

// --- Menú ---

export const estacionSchema = z.object({ nombre: texto(60) });
export type EstacionInput = z.infer<typeof estacionSchema>;

export const categoriaSchema = z.object({
  nombreEs: texto(),
  nombreEn: texto(),
  orden: z.number().int().min(0).optional(),
  activa: z.boolean().optional(),
});
export const actualizarCategoriaSchema = categoriaSchema.partial();
export type CategoriaInput = z.infer<typeof categoriaSchema>;
export type ActualizarCategoriaInput = z.infer<typeof actualizarCategoriaSchema>;

export const ordenSchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'IDs repetidos'),
});
export type OrdenInput = z.infer<typeof ordenSchema>;

export const platoSchema = z.object({
  categoriaId: z.uuid(),
  estacionId: z.uuid(),
  nombreEs: texto(),
  nombreEn: texto(),
  descripcionEs: textoOpcional(),
  descripcionEn: textoOpcional(),
  precio: centimos,
  fotoUrl: urlOpcional,
  agotado: z.boolean().optional(),
  activo: z.boolean().optional(),
  orden: z.number().int().min(0).optional(),
  alergenos: z.array(texto(40)).max(20).optional(),
});
export const actualizarPlatoSchema = platoSchema.partial();
export type PlatoInput = z.infer<typeof platoSchema>;
export type ActualizarPlatoInput = z.infer<typeof actualizarPlatoSchema>;

export const agotadoSchema = z.object({ agotado: z.boolean() });

export const platoParamSchema = z.object({ platoId: z.uuid() });
export const grupoParamSchema = platoParamSchema.extend({ grupoId: z.uuid() });
export const modificadorParamSchema = grupoParamSchema.extend({ modificadorId: z.uuid() });

export const grupoSchema = z.object({
  nombreEs: texto(),
  nombreEn: texto(),
  obligatorio: z.boolean().optional(),
  minimo: z.number().int().min(0).max(50).optional(),
  maximo: z.number().int().min(1).max(50).optional(),
});
export const actualizarGrupoSchema = grupoSchema.partial();
export type GrupoInput = z.infer<typeof grupoSchema>;
export type ActualizarGrupoInput = z.infer<typeof actualizarGrupoSchema>;

export const modificadorSchema = z.object({
  nombreEs: texto(),
  nombreEn: texto(),
  precioExtra: centimos.optional(),
});
export const actualizarModificadorSchema = modificadorSchema.partial();
export type ModificadorInput = z.infer<typeof modificadorSchema>;
export type ActualizarModificadorInput = z.infer<typeof actualizarModificadorSchema>;

// --- Mesas ---

export const mesaSchema = z.object({
  numero: z.number().int().min(1).max(9999),
  nombre: textoOpcional(60),
  activa: z.boolean().optional(),
});
export const actualizarMesaSchema = mesaSchema.partial();
export type MesaInput = z.infer<typeof mesaSchema>;
export type ActualizarMesaInput = z.infer<typeof actualizarMesaSchema>;

export const qrQuerySchema = z.object({ formato: z.enum(['png', 'svg']).default('png') });

// --- Público ---

export const slugParamSchema = z.object({ slug: z.string().min(1).max(60) });
export const tokenParamSchema = z.object({ token: z.string().min(20).max(100) });

// Respuestas del API público (las usa apps/menu).
export type ModificadorPublico = {
  id: string;
  nombreEs: string;
  nombreEn: string;
  precioExtra: number;
};
export type GrupoPublico = {
  id: string;
  nombreEs: string;
  nombreEn: string;
  obligatorio: boolean;
  minimo: number;
  maximo: number;
  modificadores: ModificadorPublico[];
};
export type PlatoPublico = {
  id: string;
  nombreEs: string;
  nombreEn: string;
  descripcionEs: string | null;
  descripcionEn: string | null;
  precio: number;
  fotoUrl: string | null;
  agotado: boolean;
  alergenos: string[];
  grupos: GrupoPublico[];
};
export type MenuPublico = {
  restaurante: {
    nombre: string;
    slug: string;
    logoUrl: string | null;
    colorPrimario: string;
    moneda: Moneda;
    idiomas: Idioma[];
    porcentajeIva: number;
    porcentajeServicio: number;
    preciosIncluyenImpuestos: boolean;
  };
  categorias: { id: string; nombreEs: string; nombreEn: string; platos: PlatoPublico[] }[];
};
export type MesaPublica = {
  slug: string;
  restaurante: string;
  numero: number;
  nombre: string | null;
  cuentaId: string;
  token: string; // sesión del comensal (Authorization: Bearer)
};

// --- Operación (Fase 2) ---

export const estadoPedidoSchema = z.enum(['PENDIENTE', 'CONFIRMADO', 'CANCELADO']);
export type EstadoPedido = z.infer<typeof estadoPedidoSchema>;
export const estadoItemSchema = z.enum(['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']);
export type EstadoItem = z.infer<typeof estadoItemSchema>;
export const estadoCuentaSchema = z.enum(['ABIERTA', 'PIDIO_CUENTA', 'CERRADA']);
export type EstadoCuenta = z.infer<typeof estadoCuentaSchema>;
export const metodoPagoSchema = z.enum(['EFECTIVO', 'TARJETA', 'SINPE', 'MIXTO']);
export type MetodoPago = z.infer<typeof metodoPagoSchema>;

export const LIMITES_PEDIDO = { itemsMax: 30, cantidadMax: 20, notasMax: 200 } as const;

export const crearPedidoSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(100),
  nota: z.string().trim().max(LIMITES_PEDIDO.notasMax).optional(),
  items: z
    .array(
      z.object({
        platoId: z.uuid(),
        cantidad: z.number().int().min(1).max(LIMITES_PEDIDO.cantidadMax),
        notas: z.string().trim().max(LIMITES_PEDIDO.notasMax).optional(),
        modificadores: z
          .array(z.uuid())
          .max(50)
          .refine((ids) => new Set(ids).size === ids.length, 'Modificadores repetidos')
          .default([]),
      }),
    )
    .min(1)
    .max(LIMITES_PEDIDO.itemsMax),
});
export type CrearPedidoInput = z.infer<typeof crearPedidoSchema>;

export const motivoSchema = z.object({ motivo: z.string().trim().min(1).max(200) });
export const cambiarEstadoItemSchema = z.object({
  estado: z.enum(['EN_PREPARACION', 'LISTO', 'ENTREGADO']),
});
export const cerrarCuentaSchema = z.object({ metodoPago: metodoPagoSchema });
export const llamarSchema = z.object({ tipo: z.literal('MESERO') });
export const pedidosQuerySchema = z.object({ estado: estadoPedidoSchema.optional() });
export const itemsQuerySchema = z.object({ estado: estadoItemSchema.optional() });
export const llamadasQuerySchema = z.object({
  atendida: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

// Respuestas compartidas (las usan los frontends).
export type ModificadorElegido = { nombre: string; nombreEn: string | null; precioExtra: number };
export type ItemDetalle = {
  id: string;
  platoId: string;
  nombreEs: string;
  nombreEn: string;
  estacionId: string;
  cantidad: number;
  notas: string | null;
  precioUnitario: number;
  estado: EstadoItem;
  cancelado: boolean;
  motivoCancelacion: string | null;
  modificadores: ModificadorElegido[];
  updatedAt: string;
};
export type PedidoDetalle = {
  id: string;
  estado: EstadoPedido;
  origen: 'CLIENTE' | 'MESERO';
  nota: string | null;
  createdAt: string;
  confirmadoEn: string | null;
  updatedAt: string;
  items: ItemDetalle[];
};
export type CuentaDetalle = {
  id: string;
  estado: EstadoCuenta;
  mesa: { id: string; numero: number; nombre: string | null };
  verificada: boolean;
  subtotal: number;
  montoServicio: number;
  montoIva: number;
  total: number;
  metodoPago: MetodoPago | null;
  abiertaEn: string;
  cerradaEn: string | null;
  updatedAt: string;
  pedidos: PedidoDetalle[];
};

export type EstadoMesa = 'LIBRE' | 'OCUPADA' | 'PEDIDO_PENDIENTE' | 'PIDIO_CUENTA' | 'LLAMADA';
export type MesaOperacion = {
  id: string;
  numero: number;
  nombre: string | null;
  estado: EstadoMesa; // el más urgente
  cuenta: {
    id: string;
    estado: EstadoCuenta;
    total: number;
    abiertaEn: string;
    pedidosPendientes: number;
  } | null;
  llamadasActivas: number;
};

// Pantalla de estación: ítems activos agrupados por pedido.
export type PedidoEstacion = {
  pedidoId: string;
  mesa: { numero: number; nombre: string | null };
  confirmadoEn: string;
  nota: string | null;
  items: ItemDetalle[];
};

export type ReporteHoy = {
  desde: string;
  totalVendido: number;
  cuentasCerradas: number;
  ticketPromedio: number;
  topPlatos: { platoId: string; nombreEs: string; cantidad: number }[];
  tiempoPromedioPreparacionSeg: number | null;
};

export * from './totales';
export * from './seleccion';
