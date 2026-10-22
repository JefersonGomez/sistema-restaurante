import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';

// Lista que se ordena arrastrando (mouse, dedo o teclado: espacio para tomar, flechas, espacio).
export function ListaOrdenable<T extends { id: string }>({
  items,
  onOrdenar,
  render,
}: {
  items: T[];
  onOrdenar: (ids: string[]) => void;
  render: (item: T, asa: ReactNode) => ReactNode;
}) {
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    onOrdenar(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alSoltar}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <Fila key={item.id} id={item.id}>
              {(asa) => render(item, asa)}
            </Fila>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Fila({ id, children }: { id: string; children: (asa: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const asa = (
    <button
      type="button"
      aria-label="Arrastrar para ordenar"
      className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted hover:bg-surface active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-5" aria-hidden />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={isDragging ? 'relative z-10 opacity-80' : ''}
    >
      {children(asa)}
    </li>
  );
}
