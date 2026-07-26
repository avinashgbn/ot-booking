import { useState, useRef, useCallback } from 'react';
import { GripVertical } from 'lucide-react';

interface ReorderableListProps<T> {
  items: T[];
  onReorder: (newItems: T[]) => void;
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function ReorderableList<T>({ items, onReorder, getKey, renderItem }: ReorderableListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [pressing, setPressing] = useState(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());

  const handlePointerDown = useCallback((e: React.PointerEvent, index: number) => {
    if (e.button !== undefined && e.button !== 0) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    setDragIndex(index);
    setPressing(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPos.current || dragIndex === null) return;

    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx < 5 && dy < 5) return;
    movedRef.current = true;

    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    for (const el of elements) {
      const key = (el as HTMLElement).dataset?.reorderKey;
      if (key) {
        const overIdx = items.findIndex((item) => getKey(item) === key);
        if (overIdx !== -1 && overIdx !== dragIndex) {
          setOverIndex(overIdx);
        }
        break;
      }
    }
  }, [dragIndex, items, getKey]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragIndex !== null && overIndex !== null && movedRef.current && dragIndex !== overIndex) {
      const newItems = [...items];
      const [moved] = newItems.splice(dragIndex, 1);
      newItems.splice(overIndex, 0, moved);
      onReorder(newItems);
    }
    setDragIndex(null);
    setOverIndex(null);
    setPressing(false);
    startPos.current = null;
    movedRef.current = false;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, [dragIndex, overIndex, items, onReorder]);

  return (
    <div ref={listRef} className="space-y-2 select-none">
      {items.map((item, index) => {
        const key = getKey(item);
        const isDragging = dragIndex === index;
        const isOver = overIndex === index && dragIndex !== index;
        return (
          <div
            key={key}
            data-reorder-key={key}
            ref={(el) => {
              if (el) itemRefs.current.set(key, el);
              else itemRefs.current.delete(key);
            }}
            onPointerDown={(e) => handlePointerDown(e, index)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`flex items-center gap-2 p-3 border rounded-lg bg-white transition-all duration-150 touch-none ${
              isDragging ? 'opacity-50 shadow-lg scale-[1.02] z-10' : ''
            } ${isOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200'} ${
              pressing ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{ touchAction: 'none' }}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-400 w-6 flex-shrink-0">{index + 1}</span>
              <div className="flex-1 min-w-0">{renderItem(item, index)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
