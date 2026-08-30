"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

/** Mirror of the workflow contract cap (apps/fitness-coach/CLAUDE.md). */
const MESSAGE_MAX = 4000;
const STORE_KEY = "fitness-coach.v1";

type Turn = {
  id: string;
  n: number;
  you: string;
  coach: string | null;
  error: string | null;
};

const EXAMPLES = [
  "I'm new to lifting — 3 days a week, dumbbells only. Where do I start?",
  "Build me a 20-minute morning mobility routine for tight hips.",
  "How much protein should I aim for to keep muscle while losing fat?",
];

export function CoachChat() {
  const [sessionId, setSessionId] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // ---- load / persist -------------------------------------------------
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{
          sessionId: string;
          turns: Turn[];
        }>;
        if (saved.sessionId) setSessionId(saved.sessionId);
        if (Array.isArray(saved.turns)) setTurns(saved.turns);
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
      localStorage.setItem(STORE_KEY, JSON.stringify({ sessionId, turns }));
    } catch {
      /* storage may be unavailable */
    }
  }, [ready, sessionId, turns]);

  // ---- scroll to newest --------------------------------------------------
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  // ---- send -----------------------------------------------------------
  const run = useCallback(
    async (id: string, message: string) => {
      setPending(true);
      setTurns((list) =>
        list.map((t) => (t.id === id ? { ...t, coach: null, error: null } : t)),
      );
      try {
        const res = await fetch("/api/coach", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, sessionId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          reply?: string;
          message?: string;
        };
        setTurns((list) =>
          list.map((t) => {
            if (t.id !== id) return t;
            if (res.ok && typeof data.reply === "string") {
              return { ...t, coach: data.reply, error: null };
            }
            return {
              ...t,
              error:
                data.message || "The coach didn't answer. Try sending it again.",
            };
          }),
        );
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
    [sessionId],
  );

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || pending || message.length > MESSAGE_MAX) return;
      const turn: Turn = {
        id: crypto.randomUUID(),
        n: turns.length + 1,
        you: message,
        coach: null,
        error: null,
      };
      setTurns((list) => [...list, turn]);
      setDraft("");
      if (areaRef.current) areaRef.current.style.height = "auto";
      void run(turn.id, message);
    },
    [pending, turns.length, run],
  );

  function newLog() {
    const id = crypto.randomUUID();
    setTurns([]);
    setSessionId(id);
    setDraft("");
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ sessionId: id, turns: [] }));
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
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    }
  }

  const over = draft.length > MESSAGE_MAX;
  const nearLimit = draft.length > MESSAGE_MAX - 400;
  const shortId = sessionId ? sessionId.replace(/-/g, "").slice(0, 6) : "······";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* header ------------------------------------------------------- */}
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                pending
                  ? "bg-[#c98a2b] motion-safe:animate-pulse"
                  : "bg-primary",
              )}
            />
            <span className="font-mono text-[0.7rem] font-medium tracking-[0.22em] text-ink-soft">
              FITNESS&nbsp;COACH
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.68rem] text-ink-soft">
              log&nbsp;#{shortId}
            </span>
            <button
              onClick={newLog}
              disabled={turns.length === 0 && !draft}
              className="rounded-sm px-2 py-1 font-mono text-[0.68rem] tracking-[0.12em] text-ink-soft uppercase transition-colors hover:text-ink hover:bg-secondary disabled:opacity-40 disabled:hover:bg-transparent"
            >
              New log
            </button>
          </div>
        </div>
        <p className="mx-auto w-full max-w-2xl px-5 pb-2.5 text-[0.74rem] leading-snug text-ink-soft">
          Evidence-based coaching for lifting, yoga, mobility &amp; balanced
          nutrition. Educational — not medical advice.
        </p>
      </header>

      {/* transcript ------------------------------------------------------ */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-5 pt-8 pb-10">
          {turns.length === 0 ? (
            <div className="entry-in pt-6">
              <p className="max-w-md font-serif text-[1.35rem] leading-snug text-ink">
                Tell the coach what you&apos;re training for.
              </p>
              <p className="mt-2 max-w-md text-sm text-ink-soft">
                Each reply builds on the last, so start with your goal, your
                schedule, and the equipment you have.
              </p>
              <ul className="mt-6 flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <button
                      onClick={() => {
                        onDraft(ex);
                        areaRef.current?.focus();
                      }}
                      className="w-full rounded-sm border border-rule bg-card px-3.5 py-2.5 text-left font-mono text-[0.8rem] leading-snug text-ink-soft transition-colors hover:border-primary hover:text-ink"
                    >
                      <span className="text-primary">›</span> {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="flex flex-col gap-9">
              {turns.map((turn) => {
                const writing =
                  pending && turn.coach === null && turn.error === null;
                return (
                  <li
                    key={turn.id}
                    className="entry-in relative md:pl-12"
                    style={{ animationDuration: "0.28s" }}
                  >
                    <span
                      aria-hidden
                      className="mb-1 block font-mono text-[0.72rem] text-ink-soft md:absolute md:left-0 md:top-0.5 md:mb-0"
                    >
                      {String(turn.n).padStart(2, "0")}
                    </span>

                    <p className="font-mono text-[0.82rem] leading-relaxed text-ink">
                      <span className="text-primary">›</span> {turn.you}
                    </p>

                    <div className="mt-3 border-l-2 border-primary bg-accent px-4 py-3">
                      {turn.coach !== null ? (
                        <Markdown>{turn.coach}</Markdown>
                      ) : turn.error !== null ? (
                        <div className="font-sans text-sm">
                          <p className="text-flag">{turn.error}</p>
                          <button
                            onClick={() => run(turn.id, turn.you)}
                            disabled={pending}
                            className="mt-2 rounded-sm border border-rule px-2 py-1 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-ink-soft transition-colors hover:text-ink hover:border-ink-soft disabled:opacity-40"
                          >
                            Retry
                          </button>
                        </div>
                      ) : (
                        <p
                          className={cn(
                            "font-serif text-[0.95rem] italic text-ink-soft",
                            writing && "coach-caret",
                          )}
                        >
                          the coach is writing
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* composer ---------------------------------------------------------- */}
      <div className="border-t border-rule bg-background">
        <div className="mx-auto w-full max-w-2xl px-5 py-3">
          <div className="flex items-end gap-3">
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
              className="max-h-[220px] min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 font-sans text-[0.95rem] leading-relaxed text-ink placeholder:text-ink-soft/70 focus:outline-none"
            />
            <button
              onClick={() => send(draft)}
              disabled={pending || !draft.trim() || over}
              className="shrink-0 rounded-sm bg-primary px-4 py-2 font-mono text-[0.74rem] font-medium uppercase tracking-[0.12em] text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-35"
            >
              {pending ? "Sending" : "Send"}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[0.66rem] text-ink-soft">
            <span>Enter to send · Shift+Enter for a new line</span>
            {nearLimit && (
              <span className={cn(over && "text-flag")}>
                {draft.length.toLocaleString()}/{MESSAGE_MAX.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
