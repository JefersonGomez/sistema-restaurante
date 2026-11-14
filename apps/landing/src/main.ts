import './estilos.css';
import { DIAS_PRUEBA, montoSugerido, PLANES, type PlanId } from '@menu-qr/shared/planes';

// Con JS las secciones aparecen al bajar; sin JS todo queda visible.
document.documentElement.classList.add('js');
const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Botones "Entrar" / "Probar gratis" → panel (registro o login).
const panel = (import.meta.env.VITE_PANEL_URL as string | undefined) ?? 'http://localhost:5181';
for (const a of document.querySelectorAll<HTMLAnchorElement>('[data-panel]'))
  a.href = `${panel}${a.dataset.panel}`;

// Precios y días de prueba desde los mismos datos que usa el sistema.
const colones = (centimos: number) => `₡${(centimos / 100).toLocaleString('es-CR')}`;
for (const el of document.querySelectorAll<HTMLElement>('[data-precio]'))
  el.textContent = colones(PLANES[el.dataset.precio as PlanId].mensual);
for (const el of document.querySelectorAll<HTMLElement>('[data-anual]'))
  el.textContent = colones(montoSugerido(el.dataset.anual as PlanId, 12));
for (const el of document.querySelectorAll('[data-dias-prueba]'))
  el.textContent = String(DIAS_PRUEBA);
for (const el of document.querySelectorAll('[data-anio]'))
  el.textContent = String(new Date().getFullYear());

// Aparecer al bajar (secciones, tarjetas y franjas); las de una misma fila, escalonadas.
const vistos = new IntersectionObserver(
  (entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('visto');
      // El gorro de la llamada final vuelve a caer al aparecer.
      const gorro = e.target.querySelector('.gorro-grande');
      if (gorro) {
        gorro.classList.remove('kg-animado');
        void (gorro as SVGElement).getBoundingClientRect();
        gorro.classList.add('kg-animado');
      }
      vistos.unobserve(e.target);
    }
  },
  { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
);
for (const grupo of document.querySelectorAll('.pasos, .tarjetas, .planes, .preguntas'))
  grupo.querySelectorAll<HTMLElement>('.revelar').forEach((el, i) => {
    el.style.setProperty('--retraso', `${(i % 3) * 90}ms`);
  });
for (const el of document.querySelectorAll('.revelar, .franjas')) vistos.observe(el);

// Pantalla de cocina del hero: entra una comanda nueva cada pocos segundos.
const COMANDAS: [string, string][] = [
  ['Mesa 7', '3× Gallo pinto · 2× Café'],
  ['Domicilio #31', '1× Olla de carne · 1× Fresco'],
  ['Mesa 2', '2× Chifrijo · 2× Imperial'],
  ['Llevar #13', '1× Casado con bistec'],
  ['Mesa 9', '4× Empanadas de queso'],
  ['Mesa 4', 'Listo · avisar mesero'],
];
const lista = document.querySelector<HTMLUListElement>('[data-comandas]');
const contador = document.querySelector('[data-contador]');
if (lista && !quieto) {
  let n = 0;
  setInterval(() => {
    const [lugar, platos] = COMANDAS[n++ % COMANDAS.length]!;
    const li = document.createElement('li');
    li.className = `comanda nueva${platos.startsWith('Listo') ? ' listo' : ''}`;
    li.innerHTML = '<b></b><span></span><i>0:0' + ((n % 9) + 1) + '</i>';
    li.querySelector('b')!.textContent = lugar;
    li.querySelector('span')!.textContent = platos;
    lista.prepend(li);
    while (lista.children.length > 3) lista.lastElementChild!.remove();
    if (contador) contador.textContent = String(2 + (n % 3));
  }, 2600);
}
