import { Check, Gift } from 'lucide-react';
import type { Fidelidad } from '@menu-qr/shared';
import { useTextos } from '../estado/idioma';

// Tarjeta de sellos: un círculo por sello; al completarla dice que pida su premio.
export function TarjetaSellos({ f }: { f: Fidelidad }) {
  const t = useTextos();
  const llenos = Math.min(f.sellos, f.meta);
  const completa = f.sellos >= f.meta;
  return (
    <section
      className={`flex flex-col gap-2.5 rounded-lg p-4 ${completa ? 'bg-ok-soft text-ok' : 'bg-surface'}`}
    >
      <p className="flex items-center gap-2 font-semibold">
        <Gift className="size-5" aria-hidden /> {t.sellos(llenos, f.meta)}
      </p>
      <ol className="flex flex-wrap gap-1.5" aria-hidden>
        {Array.from({ length: f.meta }, (_, i) => (
          <li
            key={i}
            className={`grid size-7 place-items-center rounded-full border-2 ${i < llenos ? 'border-transparent bg-purple text-on-accent' : 'border-line'}`}
          >
            {i < llenos && <Check className="size-4" />}
          </li>
        ))}
      </ol>
      <p className={`text-sm ${completa ? 'font-semibold' : 'text-muted'}`}>
        {completa ? t.sellosCompleto(f.premio) : t.sellosComo(f.meta, f.premio)}
      </p>
    </section>
  );
}
