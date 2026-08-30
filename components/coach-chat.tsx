"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { ProgressRail } from "@/components/progress-rail";
import { ProgressSheet } from "@/components/progress-sheet";
import { useProgress } from "@/hooks/use-progress";
import { MILESTONES, type AchievementId, type ProgressEvent } from "@/lib/progress";
import { cn } from "@/lib/utils";

const MESSAGE_MAX = 4000; // mirrors the workflow contract (apps/fitness-coach/CLAUDE.md)
const STORE_KEY = "fitness-coach.v1";

type Turn = {
  id: string;
  you: string;
  coach: string | null;
  error: string | null;
};

type Marker = {
  id: string;
  afterTurnId: string;
  level: number;
  count: number;
};

type Toast = { id: string; text: string };

const EXAMPLES = [
  "I'm new to lifting — 3 days a week, dumbbells only. Where do I start?",
  "Build me a 20-minute morning mobility routine for tight hips.",
  "How much protein should I aim for to keep muscle while losing fat?",
];

export function CoachChat() {
  const { progress, ready: progressReady, recordReply, newChat } = useProgress();

  const [sessionId, setSessionId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [justUnlocked, setJustUnlocked] = useState<Set<AchievementId>>(new Set());

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const rewarded = useRef<Set<string>>(new Set());
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // ---- load / persist transcript -----------------------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{
          sessionId: string;
          turns: Turn[];
          markers: Marker[];
        }>;
        if (saved.sessionId) setSessionId(saved.sessionId);
        if (Array.isArray(saved.turns)) setTurns(saved.turns);
        if (Array.isArray(saved.markers)) setMarkers(saved.markers);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setSessionId((s) => s || crypto.randomUUID());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ sessionId, turns, markers }),
      );
    } catch {
      /* storage may be unavailable */
    }
  }, [ready, sessionId, turns, markers]);

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, markers, pending]);

  // ---- celebrate ---------------------------------------------------
  const pushToast = useCallback((text: string) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const celebrate = useCallback(
    (events: ProgressEvent[], afterTurnId: string, newCount: number) => {
      const levelUps = events.filter((e) => e.type === "level-up");
      const achievements = events.filter((e) => e.type === "achievement");

      if (levelUps.length) {
        const top = levelUps[levelUps.length - 1];
        setMarkers((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            afterTurnId,
            level: top.level,
            count: newCount,
          },
        ]);
      }
      if (achievements.length) {
        setJustUnlocked(new Set(achievements.map((a) => a.id)));
        setTimeout(() => setJustUnlocked(new Set()), 1100);
        for (const a of achievements) {
          const label = MILESTONES.find((m) => m.id === a.id)?.label ?? a.id;
          pushToast(`Milestone · ${label}`);
        }
      }
    },
    [pushToast],
  );

  // ---- send ------------------------------------------------------
  const run = useCallback(
    async (id: string, message: string) => {
      setPending(true);
      setTurns((list) =>
        list.map((t) => (t.id === id ? { ...t, coach: null, error: null } : t)),
      );
      try {
        const p = progressRef.current;
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message,
            sessionId,
            stats: {
              level: p.level,
              streak: p.streak,
              messages: p.messages,
            },
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          message?: string;
        };

        if (res.ok && typeof data.reply === "string") {
          const reply = data.reply;
          setTurns((list) =>
            list.map((t) => (t.id === id ? { ...t, coach: reply, error: null } : t)),
          );
          if (!rewarded.current.has(id)) {
            rewarded.current.add(id);
            const { progress: nextP, events } = recordReply({
              userText: message,
              coachText: reply,
            });
            celebrate(events, id, nextP.messages);
          }
        } else {
          setTurns((list) =>
            list.map((t) =>
              t.id === id
                ? {
                    ...t,
                    error:
                      data.message ||
                      "The coach didn't answer. Try sending it again.",
                  }
                : t,
            ),
          );
        }
      } catch {
        setTurns((list) =>
          list.map((t) =>
            t.id === id
              ? { ...t, error: "Couldn't reach the coach. Try again." }
              : t,
          ),
        );
      } finally {
        setPending(false);
        requestAnimationFrame(() => areaRef.current?.focus());
      }
    },
    [sessionId, recordReply, celebrate],
  );

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || pending || message.length > MESSAGE_MAX) return;
      const turn: Turn = {
        id: crypto.randomUUID(),
        you: message,
        coach: null,
        error: null,
      };
      setTurns((list) => [...list, turn]);
      setDraft("");
      if (areaRef.current) areaRef.current.style.height = "auto";
      void run(turn.id, message);
    },
    [pending, run],
  );

  function handleNewChat() {
    setTurns([]);
    setMarkers([]);
    setDraft("");
    rewarded.current = new Set();
    const id = crypto.randomUUID();
    setSessionId(id);
    newChat();
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ sessionId: id, turns: [], markers: [] }),
      );
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => areaRef.current?.focus());
  }

  function onDraft(value: string) {
    setDraft(value);
    const el = areaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }

  const over = draft.length > MESSAGE_MAX;
  const nearLimit = draft.length > MESSAGE_MAX - 400;
  const showProgress = ready && progressReady;
  const markersByTurn = markers.reduce<Record<string, Marker[]>>((acc, m) => {
    (acc[m.afterTurnId] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              pending ? "bg-[#c98a2b] motion-safe:animate-pulse" : "bg-accent",
            )}
          />
          <span className="text-[0.9rem] font-medium tracking-tight text-ink">
            Fitness Coach
          </span>
        </div>
        <button
          type="button"
          onClick={handleNewChat}
          disabled={turns.length === 0 && !draft}
          className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          New chat
        </button>
      </header>

      {showProgress && (
        <ProgressSheet progress={progress} justUnlocked={justUnlocked} />
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[680px] px-5 py-10">
              {turns.length === 0 ? (
                <div className="entry-in max-w-[440px] py-6">
                  <h1 className="font-serif text-[1.5rem] leading-snug text-ink">
                    What are you training for?
                  </h1>
                  <p className="mt-2 text-[0.9rem] leading-relaxed text-ink-muted">
                    Tell the coach your goal, your week, and the equipment you
                    have. Each reply builds on the last.
                  </p>
                  <div className="mt-6 flex flex-col divide-y divide-line border-y border-line">
                    {EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => {
                          onDraft(ex);
                          areaRef.current?.focus();
                        }}
                        className="py-3 text-left text-[0.85rem] leading-snug text-ink-muted transition-colors hover:text-ink"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                  <p className="mt-5 text-[0.72rem] text-ink-faint">
                    Educational coaching, not medical advice.
                  </p>
                </div>
              ) : (
                <div>
                  {turns.map((turn) => {
                    const writing =
                      pending && turn.coach === null && turn.error === null;
                    return (
                      <div key={turn.id}>
                        <div className="entry-in mb-10">
                          <div className="mb-1.5 font-mono text-[0.66rem] uppercase tracking-[0.15em] text-ink-faint">
                            You
                          </div>
                          <p className="whitespace-pre-wrap text-[0.9rem] leading-relaxed text-ink">
                            {turn.you}
                          </p>

                          <div className="mt-5">
                            <div className="mb-1.5 font-mono text-[0.66rem] uppercase tracking-[0.15em] text-ink-faint">
                              Coach
                            </div>
                            {turn.coach !== null ? (
                              <Markdown>{turn.coach}</Markdown>
                            ) : turn.error !== null ? (
                              <div className="text-[0.875rem]">
                                <p className="text-danger">{turn.error}</p>
                                <button
                                  type="button"
                                  onClick={() => run(turn.id, turn.you)}
                                  disabled={pending}
                                  className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-ink-muted underline underline-offset-4 transition-colors hover:text-ink disabled:opacity-40"
                                >
                                  Try again
                                </button>
                              </div>
                            ) : (
                              <p
                                className={cn(
                                  "font-serif text-[0.95rem] italic text-ink-muted",
                                  writing && "coach-caret",
                                )}
                              >
                                thinking
                              </p>
                            )}
                          </div>
                        </div>

                        {markersByTurn[turn.id]?.map((m) => (
                          <div
                            key={m.id}
                            className="my-8 flex items-center gap-3 font-mono text-[0.64rem] uppercase tracking-[0.14em] text-ink-faint"
                          >
                            <span className="h-px flex-1 bg-line" />
                            Level {m.level} · {m.count} questions in
                            <span className="h-px flex-1 bg-line" />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-line">
            <div className="mx-auto w-full max-w-[680px] px-5 py-3">
              <div className="flex items-end gap-2 rounded-[6px] border border-line bg-surface px-3 py-2 transition-colors focus-within:border-line-strong">
                <textarea
                  ref={areaRef}
                  value={draft}
                  onChange={(e) => onDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(draft);
                    }
                  }}
                  rows={1}
                  placeholder="Ask the coach…"
                  aria-label="Message the coach"
                  className="max-h-[200px] min-h-[1.5rem] flex-1 resize-none bg-transparent py-1 text-[0.9rem] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => send(draft)}
                  disabled={pending || !draft.trim() || over}
                  className="shrink-0 rounded-[4px] bg-accent px-3.5 py-1.5 font-mono text-[0.68rem] font-medium uppercase tracking-[0.12em] text-on-brand transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {pending ? "…" : "Send"}
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between font-mono text-[0.64rem] text-ink-faint">
                <span>Enter to send · Educational, not medical advice</span>
                {nearLimit && (
                  <span className={cn(over && "text-danger")}>
                    {draft.length.toLocaleString()}/
                    {MESSAGE_MAX.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {showProgress && (
          <ProgressRail progress={progress} justUnlocked={justUnlocked} />
        )}
      </div>

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-28 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="entry-in rounded-[6px] border border-line bg-surface px-3 py-1.5 font-mono text-[0.7rem] text-ink shadow-[0_4px_20px_rgba(0,0,0,0.10)]"
            >
              {t.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
