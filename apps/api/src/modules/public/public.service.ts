import { estaAbierto, turnosDeHoy, type MenuPublico } from '@menu-qr/shared';
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
      colorAcento: true,
      moneda: true,
      idiomas: true,
      porcentajeIva: true,
      porcentajeServicio: true,
      preciosIncluyenImpuestos: true,
      zonaHoraria: true,
      cerradoManual: true,
      platoDestacadoId: true,
      textoPromoEs: true,
      textoPromoEn: true,
      precioPromo: true,
      horarios: { select: { diaSemana: true, abre: true, cierra: true } },
    },
  });
  if (!r || !r.activo) throw noExiste('Restaurante');
  const {
    id: restauranteId,
    activo: _activo,
    horarios,
    platoDestacadoId,
    textoPromoEs,
    textoPromoEn,
    precioPromo,
    ...datos
  } = r;
  const ahora = new Date();
  const restaurante = {
    ...datos,
    abierto: estaAbierto(horarios, ahora, r.zonaHoraria, r.cerradoManual),
    horarioHoy: turnosDeHoy(horarios, ahora, r.zonaHoraria),
  };

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
          fotoMiniUrl: true,
          agotado: true,
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

  // El plato en promoción se muestra (y se cobra, ver pedidos.service) al precio de promo.
  let promocion: MenuPublico['promocion'] = null;
  const conPrecios = categorias.map((c) => ({
    ...c,
    platos: c.platos.map((p) => {
      if (p.id !== platoDestacadoId) return { ...p, precioAntes: null };
      const precio = precioPromo ?? p.precio;
      const precioAntes = precioPromo != null && precioPromo !== p.precio ? p.precio : null;
      promocion = {
        platoId: p.id,
        textoEs: textoPromoEs,
        textoEn: textoPromoEn,
        precio,
        precioAntes,
      };
      return { ...p, precio, precioAntes };
    }),
  }));

  return { restaurante, promocion, categorias: conPrecios.filter((c) => c.platos.length > 0) };
}
