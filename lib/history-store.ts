"use client";

import { useSyncExternalStore } from "react";
import { readSavedBriefs, type SavedBrief } from "./brief-storage";

const HISTORY_KEY = "traceboard.briefs.v1";
const CHANGE_EVENT = "traceboard:history-change";
const EMPTY: SavedBrief[] = [];
let cachedRaw: string | null | undefined;
let cachedBriefs = EMPTY;

function getSnapshot(): SavedBrief[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        cachedBriefs = readSavedBriefs(JSON.parse(raw || "[]"));
      } catch {
        cachedBriefs = EMPTY;
      }
    }
    return cachedBriefs;
  } catch {
    return EMPTY;
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === HISTORY_KEY || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

export function useBriefHistory(): SavedBrief[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function saveBrief(record: SavedBrief): boolean {
  try {
    const next = readSavedBriefs([
      record,
      ...getSnapshot().filter((item) => item.result.id !== record.result.id),
    ]);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearBriefs(): boolean {
  try {
    localStorage.removeItem(HISTORY_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}
