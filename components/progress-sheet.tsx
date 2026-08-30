"use client";

import { useEffect, useState } from "react";
import { levelSummary, type AchievementId, type Progress } from "@/lib/progress";
import { ProgressPanel } from "@/components/progress-rail";
import { cn } from "@/lib/utils";

function StreakMark() {
  return (
    <svg viewBox="0 0 8 8" width="7" height="7" aria-hidden className="translate-y-[-1px]">
      <path d="M4 1 7 6H1Z" fill="var(--brand)" />
    </svg>
  );
}

/** Mobile / narrow: a slim stat bar under the header that opens a bottom sheet. */
export function ProgressSheet({
  progress,
  justUnlocked,
}: {
  progress: Progress;
  justUnlocked?: Set<AchievementId>;
}) {
  const [open, setOpen] = useState(false);
  const s = levelSummary(progress);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label="Open your progress"
        className="relative flex w-full items-center gap-3 border-b border-line px-5 py-2.5 text-left lg:hidden"
      >
        <span className="font-mono text-[0.72rem] tabular-nums text-ink">
          LVL {s.level}
        </span>
        <span className="flex items-center gap-1 font-mono text-[0.72rem] tabular-nums text-ink-muted">
          <StreakMark />
          {progress.streak}d
        </span>
        <span className="font-mono text-[0.72rem] tabular-nums text-ink-muted">
          {progress.messages} msgs
        </span>
        <span className="ml-auto font-mono text-[0.66rem] text-ink-faint">
          {s.xpToNext > 0 ? `${s.xpToNext} to L${s.level + 1}` : "—"}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-px bg-line">
          <span
            className="ring-fill block h-full bg-accent"
            style={{ width: `${Math.round(s.fraction * 100)}%` }}
          />
        </span>
      </button>

      {/* bottom sheet — always mounted, CSS-toggled, hidden on desktop */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!open}
      >
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/35 transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          role="dialog"
          aria-label="Your progress"
          className={cn(
            "absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-[12px] border-t border-line bg-surface px-5 pb-8 pt-3 shadow-[0_-10px_40px_rgba(0,0,0,0.10)] transition-transform duration-200 ease-out",
            open ? "translate-y-0" : "translate-y-full",
          )}
        >
          <div className="mx-auto mb-4 h-1 w-8 rounded-full bg-line-strong" />
          <div className="mb-5 flex items-center justify-between">
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-ink-faint">
              Your progress
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="font-mono text-[0.66rem] uppercase tracking-[0.12em] text-ink-muted hover:text-ink"
            >
              Close
            </button>
          </div>
          <ProgressPanel progress={progress} justUnlocked={justUnlocked} />
        </div>
      </div>
    </>
  );
}
