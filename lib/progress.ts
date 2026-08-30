/**
 * Pure progression engine for the Fitness Coach side panel.
 *
 * No React, no storage, no Date.now() hidden inside — every function takes what
 * it needs so it can be unit-tested. State lives in localStorage via
 * `hooks/use-progress.ts`; the coach never writes here.
 *
 * Model: XP is earned only on a *successful* coach reply. Levels use an
 * escalating curve. A daily streak counts consecutive local-calendar days with
 * at least one reply. Milestones are one-time, detected from the transcript.
 */

export const XP_PER_REPLY = 12;
export const XP_FIRST_OF_DAY = 18;

export type AchievementId =
  | "first-question"
  | "replies-7"
  | "replies-25"
  | "streak-3"
  | "streak-7"
  | "first-plan"
  | "well-rounded";

export type Progress = {
  xp: number;
  level: number;
  /** successful coach replies received */
  messages: number;
  /** conversations started (>= 1) */
  chats: number;
  streak: number;
  bestStreak: number;
  /** local "YYYY-MM-DD" of the most recent active day, or null */
  lastActiveDay: string | null;
  /** local "YYYY-MM-DD" of the first active day, or null */
  firstDay: string | null;
  /** recent active local days, ascending, capped at ACTIVE_DAYS_KEPT */
  activeDays: string[];
  /** keyword-group ids the user's questions have touched */
  topics: string[];
  /** achievement id -> ISO timestamp earned */
  achievements: Partial<Record<AchievementId, string>>;
};

export type ProgressEvent =
  | { type: "level-up"; level: number }
  | { type: "achievement"; id: AchievementId };

export const ACTIVE_DAYS_KEPT = 14;

export const INITIAL_PROGRESS: Progress = {
  xp: 0,
  level: 1,
  messages: 0,
  chats: 1,
  streak: 0,
  bestStreak: 0,
  lastActiveDay: null,
  firstDay: null,
  activeDays: [],
  topics: [],
  achievements: {},
};

export const MILESTONES: { id: AchievementId; label: string; hint: string }[] = [
  { id: "first-question", label: "First question", hint: "Ask the coach anything" },
  { id: "replies-7", label: "7 replies", hint: "Keep the conversation going" },
  { id: "first-plan", label: "First plan", hint: "Get a structured routine" },
  { id: "streak-3", label: "3-day streak", hint: "Show up three days running" },
  { id: "well-rounded", label: "Lift, move & fuel", hint: "Cover training, mobility and nutrition" },
  { id: "replies-25", label: "25 replies", hint: "A real coaching habit" },
  { id: "streak-7", label: "7-day streak", hint: "A full week, day after day" },
];

// ---- level curve ----------------------------------------------------------

/** Total XP required to sit at `level`. Level 1 is free. */
export function xpThreshold(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 60 * n + 20 * n * (n - 1); // 60, 160, 300, 480, 700, ... (deltas 60,100,140,180,220)
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpThreshold(level + 1) <= xp) level++;
  return level;
}

export type LevelSummary = {
  level: number;
  /** XP accumulated within the current level */
  xpInLevel: number;
  /** XP span of the current level */
  xpForLevel: number;
  /** XP remaining to the next level */
  xpToNext: number;
  /** 0..1 fill of the current level */
  fraction: number;
};

export function levelSummary(progress: Progress): LevelSummary {
  const { level, xp } = progress;
  const base = xpThreshold(level);
  const next = xpThreshold(level + 1);
  const span = next - base;
  const xpInLevel = xp - base;
  return {
    level,
    xpInLevel,
    xpForLevel: span,
    xpToNext: Math.max(0, next - xp),
    fraction: span > 0 ? Math.min(1, xpInLevel / span) : 0,
  };
}

// ---- dates (local calendar) --------------------------------------------------

export function dayString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(fromDay: string, toDay: string): number {
  const from = new Date(`${fromDay}T00:00:00`);
  const to = new Date(`${toDay}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

// ---- transcript heuristics -------------------------------------------------

const TOPIC_GROUPS: [string, RegExp][] = [
  ["lifting", /\b(lift|lifting|squat|deadlift|bench|press|barbell|dumbbell|hypertrophy|strength|reps?|sets?)\b/],
  ["yoga", /\b(yoga|asana|vinyasa|pose|poses|flow|savasana)\b/],
  ["mobility", /\b(mobility|stretch|stretching|flexibility|warm[-\s]?up|cool[-\s]?down|foam[-\s]?roll)\b/],
  ["nutrition", /\b(protein|nutrition|calorie|calories|macro|macros|diet|eat|eating|meal|carbs?|fats?)\b/],
  ["recovery", /\b(sleep|recovery|rest\s?day|deload|soreness|doms|fatigue)\b/],
];

export function detectTopics(text: string): string[] {
  const t = text.toLowerCase();
  return TOPIC_GROUPS.filter(([, re]) => re.test(t)).map(([id]) => id);
}

export function looksLikePlan(text: string): boolean {
  const hasTable = /\n\s*\|.*\|/.test(text) || /\|\s*:?-{2,}/.test(text);
  const headings = (text.match(/^#{2,3}\s+\S/gm) ?? []).length;
  const weekDay = /\b(week|day)\s*1\b/i.test(text);
  return hasTable || headings >= 2 || weekDay;
}

// ---- the one mutation -----------------------------------------------------

type RecordInput = {
  userText: string;
  coachText: string;
  /** injectable for tests; defaults to now */
  now?: Date;
};

export function recordReply(
  prev: Progress,
  { userText, coachText, now = new Date() }: RecordInput,
): { next: Progress; events: ProgressEvent[] } {
  const today = dayString(now);
  const isFirstOfDay = prev.lastActiveDay !== today;

  // xp + level
  const gain = XP_PER_REPLY + (isFirstOfDay ? XP_FIRST_OF_DAY : 0);
  const xp = prev.xp + gain;
  const level = levelFromXp(xp);

  // streak
  let streak = prev.streak;
  if (isFirstOfDay) {
    streak =
      prev.lastActiveDay && daysBetween(prev.lastActiveDay, today) === 1
        ? prev.streak + 1
        : 1;
  }
  const bestStreak = Math.max(prev.bestStreak, streak);

  // active-day strip
  const activeDays = isFirstOfDay
    ? [...prev.activeDays, today].slice(-ACTIVE_DAYS_KEPT)
    : prev.activeDays;

  // topics
  const topics = Array.from(
    new Set([...prev.topics, ...detectTopics(userText)]),
  );

  const messages = prev.messages + 1;

  const next: Progress = {
    ...prev,
    xp,
    level,
    messages,
    streak,
    bestStreak,
    lastActiveDay: today,
    firstDay: prev.firstDay ?? today,
    activeDays,
    topics,
    achievements: { ...prev.achievements },
  };

  const events: ProgressEvent[] = [];
  if (level > prev.level) events.push({ type: "level-up", level });

  const earn = (id: AchievementId, when: boolean) => {
    if (when && !next.achievements[id]) {
      next.achievements[id] = now.toISOString();
      events.push({ type: "achievement", id });
    }
  };
  earn("first-question", messages >= 1);
  earn("replies-7", messages >= 7);
  earn("replies-25", messages >= 25);
  earn("streak-3", streak >= 3);
  earn("streak-7", streak >= 7);
  earn("first-plan", looksLikePlan(coachText));
  earn("well-rounded", topics.length >= 3);

  return { next, events };
}

/** New conversation: keep all progress, just count the chat. */
export function startNewChat(prev: Progress): Progress {
  return { ...prev, chats: prev.chats + 1 };
}

/** Merge a stored (possibly older/partial) object onto the current shape. */
export function hydrate(raw: unknown): Progress {
  if (!raw || typeof raw !== "object") return { ...INITIAL_PROGRESS };
  const r = raw as Partial<Progress>;
  return {
    ...INITIAL_PROGRESS,
    ...r,
    achievements: { ...(r.achievements ?? {}) },
    activeDays: Array.isArray(r.activeDays) ? r.activeDays.slice(-ACTIVE_DAYS_KEPT) : [],
    topics: Array.isArray(r.topics) ? r.topics : [],
    // recompute level from xp so a curve change can't desync it
    level: levelFromXp(typeof r.xp === "number" ? r.xp : 0),
  };
}
