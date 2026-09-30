import { useEffect, useRef } from "react";

/**
 * Runs `fold` once for each poll that lands, for a query whose consumer keeps
 * state accumulated across polls rather than derived from the latest one.
 *
 * Keyed on `dataUpdatedAt`, not the data: structural sharing keeps the previous
 * value's identity when a poll changed nothing, which is exactly the poll a
 * "nothing happened again" counter needs to see.
 *
 * A consumer whose query can be served a value cached before it started
 * watching must keep that value out of the cache rather than filter it here —
 * a query disabled on the first render has nothing to compare against yet.
 */
export function useFoldPoll<T>(
  data: T | undefined,
  dataUpdatedAt: number,
  fold: (value: T) => void,
): void {
  const foldedAt = useRef(0);
  const latest = useRef(fold);
  latest.current = fold;

  useEffect(() => {
    if (data === undefined || !dataUpdatedAt) return;
    if (dataUpdatedAt === foldedAt.current) return;
    foldedAt.current = dataUpdatedAt;
    latest.current(data);
  }, [data, dataUpdatedAt]);
}
