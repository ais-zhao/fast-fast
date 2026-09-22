"use client";

import { useCallback, useSyncExternalStore } from "react";
import { sessionMeta } from "@/lib/market";
import {
  STORAGE_KEY,
  createPaperState,
  parsePaper,
  serializePaper,
} from "@/lib/paper";
import type { PaperState } from "@/lib/types";

const listeners = new Set<() => void>();
let cached: PaperState | null = null;
let serverSnapshot: PaperState | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function readFromStorage(fallbackSession: string): PaperState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parsePaper(raw, fallbackSession) : createPaperState(fallbackSession);
  } catch {
    return createPaperState(fallbackSession);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  if (!cached) cached = readFromStorage(sessionMeta().planFor);
  return cached;
}

function getServerSnapshot() {
  serverSnapshot ??= createPaperState(sessionMeta().planFor);
  return serverSnapshot;
}

export function usePaperAccount(defaultSession: string | null) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const fallbackSession = defaultSession ?? state.sessionDate;

  const setState = useCallback(
    (updater: PaperState | ((current: PaperState) => PaperState | null | undefined)) => {
      const current = cached ?? getSnapshot();
      const next = typeof updater === "function" ? updater(current) : updater;
      if (!next) return;
      cached = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, serializePaper(next));
      } catch {
        // Quota or private mode: keep the in-memory account so the desk still works.
      }
      emit();
    },
    [],
  );

  const reset = useCallback(() => {
    const next = createPaperState(fallbackSession);
    cached = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, serializePaper(next));
    } catch {
      // ignore
    }
    emit();
  }, [fallbackSession]);

  return { state, setState, reset };
}
