import { estaAbierto, type MenuPublico } from '@menu-qr/shared';
import { prisma } from '../../lib/prisma';
import { noExiste } from '../../middlewares/errorHandler';

const nombres = { id: true, nombreEs: true, nombreEn: true } as const;

export async function menu(slug: string): Promise<MenuPublico> {
  const r = await prisma.restaurante.findUnique({
    where: { slug },
    select: {
      id: true,
      activo: true,
      nombre: true,
      slug: true,
      logoUrl: true,
      colorPrimario: true,
      moneda: true,
      idiomas: true,
      porcentajeIva: true,
      porcentajeServicio: true,
      preciosIncluyenImpuestos: true,
      horaApertura: true,
      horaCierre: true,
    },
  });
  if (!r || !r.activo) throw noExiste('Restaurante');
  const { id: restauranteId, activo: _activo, ...datos } = r;
  const restaurante = { ...datos, abierto: estaAbierto(r.horaApertura, r.horaCierre) };

  const categorias = await prisma.categoria.findMany({
    where: { restauranteId, activa: true },
    orderBy: [{ orden: 'asc' }, { nombreEs: 'asc' }],
    select: {
      ...nombres,
      icono: true,
      // Los agotados se devuelven marcados; los inactivos no.
      platos: {
        where: { restauranteId, activo: true },
        orderBy: [{ orden: 'asc' }, { nombreEs: 'asc' }],
        select: {
          ...nombres,
          descripcionEs: true,
          descripcionEn: true,
          precio: true,
          fotoUrl: true,
          agotado: true,
          destacado: true,
          alergenos: true,
          grupos: {
            orderBy: { createdAt: 'asc' },
            select: {
              ...nombres,
              obligatorio: true,
              minimo: true,
              maximo: true,
              modificadores: {
                orderBy: { createdAt: 'asc' },
                select: { ...nombres, precioExtra: true },
              },
            },
          },
        },
      },
    },
  });

  return { restaurante, categorias: categorias.filter((c) => c.platos.length > 0) };
}
