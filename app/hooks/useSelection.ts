import { useState, useCallback, useMemo } from "react";

export interface UseSelectionReturn {
  readonly selectedIds: ReadonlySet<string>;
  readonly isSelected: (id: string) => boolean;
  readonly toggle: (id: string) => void;
  readonly selectAll: (ids: string[]) => void;
  readonly deselectAll: () => void;
  readonly selectByFilter: <T extends { id: string }>(
    items: readonly T[],
    predicate: (item: T) => boolean,
  ) => void;
  readonly selectedCount: number;
}

export function useSelection(): UseSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectByFilter = useCallback(
    <T extends { id: string }>(
      items: readonly T[],
      predicate: (item: T) => boolean,
    ) => {
      const ids = items.filter(predicate).map((item) => item.id);
      setSelectedIds(new Set(ids));
    },
    [],
  );

  const selectedCount = useMemo(() => selectedIds.size, [selectedIds]);

  return {
    selectedIds,
    isSelected,
    toggle,
    selectAll,
    deselectAll,
    selectByFilter,
    selectedCount,
  };
}
