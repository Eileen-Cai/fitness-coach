import { describe, it, expect } from "vitest";
import {
  INITIAL_PROGRESS,
  XP_PER_REPLY,
  XP_FIRST_OF_DAY,
  xpThreshold,
  levelFromXp,
  levelSummary,
  detectTopics,
  looksLikePlan,
  recordReply,
  startNewChat,
  hydrate,
  type Progress,
} from "./progress";

const at = (iso: string) => new Date(`${iso}T12:00:00`);
const clone = (): Progress => JSON.parse(JSON.stringify(INITIAL_PROGRESS));

describe("level curve", () => {
  it("thresholds escalate 0 / 60 / 160 / 300 / 480", () => {
    expect([1, 2, 3, 4, 5].map(xpThreshold)).toEqual([0, 60, 160, 300, 480]);
  });

  it("levelFromXp maps xp to the right band", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(59)).toBe(1);
    expect(levelFromXp(60)).toBe(2);
    expect(levelFromXp(159)).toBe(2);
    expect(levelFromXp(300)).toBe(4);
  });

  it("a single reply can never skip a level (max gain < min span)", () => {
    expect(XP_PER_REPLY + XP_FIRST_OF_DAY).toBeLessThan(xpThreshold(2) - xpThreshold(1));
  });

  it("levelSummary reports fill within the current level", () => {
    const s = levelSummary({ ...clone(), xp: 100, level: 2 });
    expect(s.level).toBe(2);
    expect(s.xpInLevel).toBe(40); // 100 - 60
    expect(s.xpForLevel).toBe(100); // 160 - 60
    expect(s.xpToNext).toBe(60);
    expect(s.fraction).toBeCloseTo(0.4);
  });
});

describe("recordReply — xp & level", () => {
  it("first reply of a day awards base + daily bonus", () => {
    const { next } = recordReply(clone(), {
      userText: "hi",
      coachText: "hi",
      now: at("2026-03-01"),
    });
    expect(next.xp).toBe(XP_PER_REPLY + XP_FIRST_OF_DAY);
    expect(next.messages).toBe(1);
  });

  it("later replies the same day get base only", () => {
    let p = clone();
    p = recordReply(p, { userText: "a", coachText: "a", now: at("2026-03-01") }).next;
    const before = p.xp;
    p = recordReply(p, { userText: "b", coachText: "b", now: at("2026-03-01") }).next;
    expect(p.xp - before).toBe(XP_PER_REPLY);
  });

  it("emits a level-up event when the threshold is crossed", () => {
    let p = clone();
    let sawLevelUp = false;
    for (let i = 0; i < 6; i++) {
      const r = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-01") });
      p = r.next;
      if (r.events.some((e) => e.type === "level-up")) sawLevelUp = true;
    }
    expect(sawLevelUp).toBe(true);
    expect(p.level).toBeGreaterThanOrEqual(2);
  });
});

describe("recordReply — streak", () => {
  it("consecutive days increment the streak", () => {
    let p = clone();
    p = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-01") }).next;
    p = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-02") }).next;
    p = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-03") }).next;
    expect(p.streak).toBe(3);
    expect(p.bestStreak).toBe(3);
  });

  it("a second reply the same day does not bump the streak", () => {
    let p = clone();
    p = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-01") }).next;
    p = recordReply(p, { userText: "x", coachText: "x", now: new Date("2026-03-01T18:30:00") }).next;
    expect(p.streak).toBe(1);
  });

  it("a skipped day resets the streak to 1 but keeps bestStreak", () => {
    let p = clone();
    p = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-01") }).next;
    p = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-02") }).next; // streak 2
    p = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-05") }).next; // gap
    expect(p.streak).toBe(1);
    expect(p.bestStreak).toBe(2);
  });

  it("first ever reply starts the streak at 1", () => {
    const { next } = recordReply(clone(), {
      userText: "x",
      coachText: "x",
      now: at("2026-03-01"),
    });
    expect(next.streak).toBe(1);
    expect(next.firstDay).toBe("2026-03-01");
    expect(next.activeDays).toEqual(["2026-03-01"]);
  });
});

describe("achievements", () => {
  it("first-question fires once, on the first reply", () => {
    let p = clone();
    const r1 = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-01") });
    p = r1.next;
    expect(r1.events).toContainEqual({ type: "achievement", id: "first-question" });
    const r2 = recordReply(p, { userText: "y", coachText: "y", now: at("2026-03-01") });
    expect(r2.events).not.toContainEqual({ type: "achievement", id: "first-question" });
  });

  it("first-plan fires when the reply looks structured", () => {
    const { events } = recordReply(clone(), {
      userText: "give me a routine",
      coachText: "## Week 1\n\n| Day | Focus |\n| --- | --- |\n| Mon | Full body |",
      now: at("2026-03-01"),
    });
    expect(events).toContainEqual({ type: "achievement", id: "first-plan" });
  });

  it("well-rounded needs three topic groups", () => {
    let p = clone();
    p = recordReply(p, { userText: "how many sets for squats?", coachText: "-", now: at("2026-03-01") }).next;
    p = recordReply(p, { userText: "a stretch for tight hips?", coachText: "-", now: at("2026-03-01") }).next;
    expect(p.achievements["well-rounded"]).toBeUndefined();
    const r = recordReply(p, { userText: "how much protein daily?", coachText: "-", now: at("2026-03-01") });
    expect(r.events).toContainEqual({ type: "achievement", id: "well-rounded" });
  });

  it("streak-3 fires on the third consecutive day", () => {
    let p = clone();
    p = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-01") }).next;
    p = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-02") }).next;
    const r = recordReply(p, { userText: "x", coachText: "x", now: at("2026-03-03") });
    expect(r.events).toContainEqual({ type: "achievement", id: "streak-3" });
  });
});

describe("helpers", () => {
  it("detectTopics picks keyword groups", () => {
    expect(detectTopics("How many reps for bench press?")).toContain("lifting");
    expect(detectTopics("best protein target?")).toContain("nutrition");
    expect(detectTopics("weather today")).toEqual([]);
  });

  it("looksLikePlan spots tables, headings, and week/day 1", () => {
    expect(looksLikePlan("| a | b |\n| - | - |")).toBe(true);
    expect(looksLikePlan("## A\n## B")).toBe(true);
    expect(looksLikePlan("Start with Day 1 like this")).toBe(true);
    expect(looksLikePlan("Just a sentence of advice.")).toBe(false);
  });

  it("startNewChat keeps xp and increments chats", () => {
    const p = { ...clone(), xp: 200, chats: 1 };
    expect(startNewChat(p)).toMatchObject({ xp: 200, chats: 2 });
  });

  it("hydrate fills missing fields and recomputes level from xp", () => {
    const h = hydrate({ xp: 160, messages: 9 });
    expect(h.level).toBe(3);
    expect(h.messages).toBe(9);
    expect(h.achievements).toEqual({});
    expect(h.streak).toBe(0);
  });
});
