import { useCallback, useEffect, useRef, useState } from "react";
import {
  INITIAL_PROGRESS,
  hydrate,
  recordReply as applyReply,
  startNewChat,
  type Progress,
  type ProgressEvent,
} from "@/lib/progress";

const KEY = "fitness-coach.progress.v1";

/** localStorage-backed progression. SSR-safe: renders INITIAL until mounted. */
export function useProgress() {
  const [progress, setProgress] = useState<Progress>(INITIAL_PROGRESS);
  const [ready, setReady] = useState(false);

  // keep the latest value reachable from stable callbacks
  const ref = useRef(progress);
  ref.current = progress;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setProgress(hydrate(JSON.parse(raw)));
    } catch {
      /* ignore unreadable / corrupt storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch {
      /* storage may be unavailable */
    }
  }, [ready, progress]);

  /** Call once per successful coach reply. Returns the new state + what to celebrate. */
  const recordReply = useCallback(
    (input: {
      userText: string;
      coachText: string;
    }): { progress: Progress; events: ProgressEvent[] } => {
      const { next, events } = applyReply(ref.current, input);
      setProgress(next);
      return { progress: next, events };
    },
    [],
  );

  const newChat = useCallback(() => setProgress((p) => startNewChat(p)), []);

  return { progress, ready, recordReply, newChat };
}
