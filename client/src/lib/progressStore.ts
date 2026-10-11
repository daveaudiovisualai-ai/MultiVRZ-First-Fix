/**
 * Installation progress per cable: run, terminated, tested, in position.
 * On the hosted page each cable is one shared document (progress/<cable id>),
 * so a contractor's updates reach everyone live. Elsewhere it stays on this device.
 */
import { useCallback, useEffect, useState } from "react";
import { siteProgressCollection } from "./sites";
import { getSharedDb, getSharedStatus, getSharedUser, getSharedUserId } from "./sharedSync";

export const PROGRESS_STAGES = [
  { key: "run", label: "Run", short: "Run" },
  { key: "terminated", label: "Terminated", short: "Term." },
  { key: "tested", label: "Tested", short: "Tested" },
  { key: "positioned", label: "In position", short: "In pos." },
] as const;

export type ProgressStage = (typeof PROGRESS_STAGES)[number]["key"];

export interface StageMark {
  at: string;
  by: string;
}

export type ProgressRecord = Partial<Record<ProgressStage, StageMark | null>> & { note?: string };

const LOCAL_KEY = "multivrz_progress_o2_v1";

function readLocal(): Record<string, ProgressRecord> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  } catch {
    return {};
  }
}

export function progressDocId(cableId: string) {
  return cableId.replace(/[^A-Za-z0-9_\-.~:@+]/g, "_") || "unassigned";
}

export function useProgress() {
  const db = getSharedDb();
  const shared = Boolean(db) && getSharedStatus() !== "local";
  const [records, setRecords] = useState<Record<string, ProgressRecord>>(() => (shared ? {} : readLocal()));
  const [loaded, setLoaded] = useState(!shared);
  const [readOnly, setReadOnly] = useState(getSharedStatus() === "read-only");

  useEffect(() => {
    if (!db || !shared) return;
    const unsubscribe = db.collection(siteProgressCollection()).onSnapshot(
      (snap) => {
        const next: Record<string, ProgressRecord> = {};
        snap.docs.forEach((doc) => {
          const data = doc.data();
          if (doc.exists && data) next[doc.id] = data as ProgressRecord;
        });
        setRecords(next);
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    return unsubscribe;
  }, [db, shared]);

  const write = useCallback(
    async (cableId: string, record: ProgressRecord) => {
      const id = progressDocId(cableId);
      setRecords((current) => ({ ...current, [id]: record }));
      if (db && shared) {
        try {
          await db.doc(`${siteProgressCollection()}/${id}`).set(record as Record<string, unknown>);
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (code === "invalid_argument" || code === "not_granted" || code === "revoked") setReadOnly(true);
          throw error;
        }
      } else {
        const all = { ...readLocal(), [id]: record };
        localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
      }
    },
    [db, shared]
  );

  const recordFor = useCallback((cableId: string): ProgressRecord => records[progressDocId(cableId)] ?? {}, [records]);

  /** Set or clear one stage on several cables. */
  const setStage = useCallback(
    async (cableIds: string[], stage: ProgressStage, done: boolean) => {
      const mark: StageMark | null = done ? { at: new Date().toISOString(), by: getSharedUserId() ?? "" } : null;
      await Promise.all(cableIds.map((id) => write(id, { ...recordFor(id), [stage]: mark })));
    },
    [write, recordFor]
  );

  const setNote = useCallback((cableId: string, note: string) => write(cableId, { ...recordFor(cableId), note }), [write, recordFor]);

  return { recordFor, setStage, setNote, loaded, shared, readOnly };
}

/** Resolve user ids to display names (for "who marked this"). */
export function usePeopleNames(ids: string[]) {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = Array.from(new Set(ids.filter(Boolean))).sort().join("|");
  useEffect(() => {
    const user = getSharedUser();
    const unique = key ? key.split("|") : [];
    if (!user || !unique.length) return;
    let cancelled = false;
    user
      .profiles(unique)
      .then((profiles) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        unique.forEach((id) => {
          const p = profiles[id];
          next[id] = p?.isMe ? "You" : p?.name || "Someone";
        });
        setNames(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return names;
}
