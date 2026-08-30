"use client";

import { useMemo } from "react";
import {
  MILESTONES,
  dayString,
  levelSummary,
  type AchievementId,
  type Progress,
} from "@/lib/progress";
import { LevelRing } from "@/components/level-ring";
import { cn } from "@/lib/utils";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-ink-faint">
      {children}
    </h2>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
      <path
        d="M2 6.4 4.6 9 10 3"
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WeekStrip({ activeDays }: { activeDays: string[] }) {
  const cells = useMemo(() => {
    const set = new Set(activeDays);
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      const key = dayString(d);
      return { key, active: set.has(key), today: i === 6 };
    });
  }, [activeDays]);

  return (
    <div className="flex items-center gap-2">
      {cells.map((c) => (
        <div key={c.key} className="flex flex-col items-center gap-1">
          <span
            className={cn(
              "size-1.5 rounded-full",
              c.active ? "bg-accent" : "bg-line-strong",
            )}
          />
          <span
            className={cn(
              "h-px w-3",
              c.today ? "bg-ink-faint" : "bg-transparent",
            )}
          />
        </div>
      ))}
    </div>
  );
}

export function ProgressPanel({
  progress,
  justUnlocked,
}: {
  progress: Progress;
  justUnlocked?: Set<AchievementId>;
}) {
  const s = levelSummary(progress);
  const since = progress.firstDay
    ? new Date(`${progress.firstDay}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "today";

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col items-center gap-1 pt-1">
        <LevelRing
          level={s.level}
          fraction={s.fraction}
          caption={
            s.xpToNext > 0
              ? `${s.xpToNext} XP to level ${s.level + 1}`
              : "max reach for now"
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>Streak</SectionLabel>
        <div className="flex items-baseline justify-between">
          <p className="text-ink">
            <span className="font-mono text-[1.15rem] tabular-nums">
              {progress.streak}
            </span>{" "}
            <span className="text-sm text-ink-muted">
              {progress.streak === 1 ? "day" : "days"}
            </span>
          </p>
          <p className="font-mono text-[0.7rem] text-ink-faint">
            best {progress.bestStreak}
          </p>
        </div>
        <WeekStrip activeDays={progress.activeDays} />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionLabel>Milestones</SectionLabel>
        <ul className="flex flex-col">
          {MILESTONES.map((m) => {
            const done = Boolean(progress.achievements[m.id]);
            return (
              <li
                key={m.id}
                title={m.hint}
                className={cn(
                  "-mx-2 flex items-center gap-2.5 rounded-[4px] px-2 py-1.5",
                  justUnlocked?.has(m.id) && "milestone-flash",
                )}
              >
                <span className="flex w-3 justify-center">
                  {done ? (
                    <Check />
                  ) : (
                    <span className="text-ink-faint">–</span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[0.8rem]",
                    done ? "text-ink" : "text-ink-faint",
                  )}
                >
                  {m.label}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-1 border-t border-line pt-4">
        <p className="font-mono text-[0.68rem] text-ink-faint">
          {progress.messages} messages · since {since}
        </p>
        <p className="text-[0.68rem] text-ink-faint">
          Progress is saved on this device.
        </p>
      </section>
    </div>
  );
}

export function ProgressRail({
  progress,
  justUnlocked,
}: {
  progress: Progress;
  justUnlocked?: Set<AchievementId>;
}) {
  return (
    <aside className="hidden w-[300px] shrink-0 border-l border-line lg:block">
      <div className="sticky top-0 max-h-dvh overflow-y-auto px-6 py-6">
        <ProgressPanel progress={progress} justUnlocked={justUnlocked} />
      </div>
    </aside>
  );
}
