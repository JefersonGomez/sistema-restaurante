import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../../lib/env';
import bcrypt from 'bcryptjs';
import {
  DIAS_PRUEBA,
  estadoSuscripcion,
  type AdminRestaurantePatchInput,
  type CrearRestauranteInput,
  type HorariosInput,
  type RestauranteConfigInput,
} from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { noExiste } from '../../middlewares/errorHandler';
import { borrarImagenes } from '../uploads/uploads.service';

// --- Superadmin ---

// Todo restaurante nuevo empieza con el mes de prueba.
export const finPrueba = () => new Date(Date.now() + DIAS_PRUEBA * 86_400_000);

export async function crear({ restaurante, dueno }: CrearRestauranteInput) {
  const passwordHash = await bcrypt.hash(dueno.password, 10);
  return prisma.restaurante.create({
    data: {
      ...restaurante,
      planVenceEn: finPrueba(),
      usuarios: {
        create: { nombre: dueno.nombre, email: dueno.email, passwordHash, rol: 'DUENO' },
      },
    },
    include: { usuarios: { select: { id: true, nombre: true, email: true, rol: true } } },
  });
}

export async function actualizarAdmin(id: string, data: AdminRestaurantePatchInput) {
  if (!(await prisma.restaurante.findUnique({ where: { id } }))) throw noExiste('Restaurante');
  // Activar o suspender a mano borra la marca de suspensión automática.
  return prisma.restaurante.update({
    where: { id },
    data: { ...data, ...(data.activo !== undefined && { suspendidoPorPago: false }) },
  });
}

// --- Dueño (su propio restaurante) ---

const conHorarios = {
  horarios: { orderBy: [{ diaSemana: 'asc' as const }, { abre: 'asc' as const }] },
};

export async function obtenerPropio(restauranteId: string) {
  const r = await prisma.restaurante.findUnique({
    where: { id: restauranteId },
    include: conHorarios,
  });
  if (!r) throw noExiste('Restaurante');
  return r;
}

// Reemplaza todos los turnos del restaurante.
export async function guardarHorarios(restauranteId: string, { turnos }: HorariosInput) {
  await prisma.$transaction([
    prisma.horarioRestaurante.deleteMany({ where: { restauranteId } }),
    prisma.horarioRestaurante.createMany({ data: turnos.map((t) => ({ ...t, restauranteId })) }),
  ]);
  return obtenerPropio(restauranteId);
}

export async function actualizarPropio(restauranteId: string, data: RestauranteConfigInput) {
  const previo = await obtenerPropio(restauranteId);
  // El plato de la promoción tiene que ser de este restaurante.
  if (
    data.platoDestacadoId &&
    !(await prisma.plato.findFirst({ where: { id: data.platoDestacadoId, restauranteId } }))
  )
    throw noExiste('Plato');
  const r = await prisma.restaurante.update({
    where: { id: restauranteId },
    data,
    include: conHorarios,
  });
  // La imagen reemplazada (logo o banner) se borra del almacenamiento.
  const viejas = (['logoUrl', 'bannerUrl'] as const)
    .filter((k) => data[k] !== undefined && data[k] !== previo[k])
    .map((k) => previo[k]);
  if (viejas.length) await borrarImagenes(restauranteId, viejas);
  return r;
}

// QR del enlace para pedir en línea (/r/:slug), para imprimir o compartir en redes.
export async function qrEnLinea(restauranteId: string) {
  const { slug } = await obtenerPropio(restauranteId);
  const url = `${env.MENU_PUBLIC_URL}/r/${slug}`;
  return { url, png: await QRCode.toBuffer(url, { type: 'png', margin: 2, width: 768 }) };
}

// Plan del restaurante para el aviso del panel del dueño (prueba, por vencer, vencido).
export async function suscripcion(restauranteId: string) {
  const r = await prisma.restaurante.findUniqueOrThrow({
    where: { id: restauranteId },
    select: {
      activo: true,
      plan: true,
      planVenceEn: true,
      _count: { select: { pagosPlan: true } },
    },
  });
  return {
    plan: r.plan,
    venceEn: r.planVenceEn?.toISOString() ?? null,
    estado: estadoSuscripcion({ ...r, pagos: r._count.pagosPlan }),
    soporteWhatsApp: env.SOPORTE_WHATSAPP ?? null,
  };
}

// Menú en PDF para imprimir (respaldo sin internet, Fase 11): categorías visibles con sus platos
// activos y no agotados, descripción y precio.
export async function menuPdf(restauranteId: string) {
  const r = await prisma.restaurante.findUniqueOrThrow({ where: { id: restauranteId } });
  const categorias = await prisma.categoria.findMany({
    where: { restauranteId, activa: true },
    orderBy: [{ orden: 'asc' }, { nombreEs: 'asc' }],
    include: {
      platos: {
        where: { activo: true, agotado: false },
        orderBy: [{ orden: 'asc' }, { nombreEs: 'asc' }],
      },
    },
  });
  const precio = new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: r.moneda,
    maximumFractionDigits: r.moneda === 'CRC' ? 0 : 2,
  });

  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 54,
    info: { Title: `Menú · ${r.nombre}` },
  });
  const partes: Buffer[] = [];
  doc.on('data', (b: Buffer) => partes.push(b));
  const terminado = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(partes))));
  const izq = 54;
  const ancho = 612 - 54 * 2;
  const finPagina = 792 - 54;

  doc.font('Helvetica-Bold').fontSize(26).fillColor('#1d1b2a').text(r.nombre, { align: 'center' });
  if (r.eslogan)
    doc.font('Helvetica').fontSize(11).fillColor('#6f6c80').text(r.eslogan, { align: 'center' });
  doc.moveDown(1.2);

  for (const c of categorias.filter((c) => c.platos.length > 0)) {
    if (doc.y > finPagina - 80) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#1d1b2a').text(c.nombreEs, izq, doc.y);
    doc
      .moveTo(izq, doc.y + 2)
      .lineTo(izq + ancho, doc.y + 2)
      .lineWidth(0.8)
      .strokeColor('#d9d7e0')
      .stroke();
    doc.moveDown(0.6);
    for (const p of c.platos) {
      if (doc.y > finPagina - 40) doc.addPage();
      const y = doc.y;
      // Nombre a la izquierda y precio a la derecha, en la misma línea.
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#1d1b2a');
      // Las fuentes estándar del PDF no traen "₡": se usa "¢", como se escribe a mano en Costa Rica.
      doc.text(precio.format(p.precio / 100).replace('₡', '¢'), izq, y, {
        width: ancho,
        align: 'right',
      });
      doc.text(p.nombreEs, izq, y, { width: ancho - 90 });
      if (p.descripcionEs)
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#6f6c80')
          .text(p.descripcionEs, izq, doc.y + 1, { width: ancho - 90 });
      doc.moveDown(0.55);
    }
    doc.moveDown(0.6);
  }

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#6f6c80')
    .text(
      `${r.preciosIncluyenImpuestos ? `Precios con IVA (${r.porcentajeIva}%) incluido.` : `Precios más IVA (${r.porcentajeIva}%).`} Menú impreso el ${new Date().toLocaleDateString('es-CR')}.`,
      izq,
      Math.max(doc.y + 10, finPagina - 12),
      { width: ancho, align: 'center' },
    );
  doc.end();
  return terminado;
}
