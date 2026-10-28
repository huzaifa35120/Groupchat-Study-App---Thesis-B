// Conversation statistics recorded for a session when it ends. Moderator
// messages are excluded from everything except the operatorMessages count.

import { messageFeatures, tokenize } from "../text/features";
import { gini, mean, median, normalisedEntropy, quantile, sd } from "./stats";

export interface StatsMessage {
  participantId: string;
  speaker: string; // anonymised label, e.g. P1
  body: string;
  createdAt: string;
}

export interface SessionStats {
  version: 1;
  computedAt: string;
  plannedDurationSec: number;
  actualDurationSec: number | null;
  speakers: number;
  messages: number;
  operatorMessages: number;
  words: number;
  messagesPerMinute: number | null;
  wordsPerMessage: { mean: number | null; median: number | null; sd: number | null };
  charsPerMessage: { mean: number | null; median: number | null; sd: number | null };
  shares: {
    short: number | null;
    question: number | null;
    exclamation: number | null;
    emoji: number | null;
    laughter: number | null;
    slang: number | null;
    firstPerson: number | null;
    startsLowercase: number | null;
    endsWithPunctuation: number | null;
    allLowercase: number | null;
  };
  typeTokenRatio: number | null;
  uniqueWords: number;
  speakerSwitchRate: number | null;
  meanBurstLength: number | null;
  gapSeconds: { median: number | null; mean: number | null; p90: number | null };
  responseLatencySeconds: { median: number | null; mean: number | null };
  participation: { entropy: number | null; gini: number | null };
  perSpeaker: { speaker: string; messages: number; words: number; meanWords: number | null; shortShare: number | null }[];
  perMinute: number[];
}

function share(flags: boolean[]): number | null {
  return flags.length ? flags.filter(Boolean).length / flags.length : null;
}

export function computeSessionStats(input: {
  messages: StatsMessage[];
  operatorMessages: number;
  plannedDurationSec: number;
  startedAt: string | null;
  endedAt: string | null;
}): SessionStats {
  const msgs = input.messages;
  const features = msgs.map((m) => messageFeatures(m.body));
  const words = features.map((f) => f.words);
  const chars = features.map((f) => f.chars);
  const allTokens = msgs.flatMap((m) => tokenize(m.body));
  const unique = new Set(allTokens);

  const start = input.startedAt ? Date.parse(input.startedAt) : msgs.length ? Date.parse(msgs[0].createdAt) : null;
  const end = input.endedAt ? Date.parse(input.endedAt) : msgs.length ? Date.parse(msgs[msgs.length - 1].createdAt) : null;
  const actualDurationSec = start !== null && end !== null ? Math.max(0, (end - start) / 1000) : null;

  // Turn-taking
  let switches = 0;
  const bursts: number[] = [];
  let burst = 0;
  const gaps: number[] = [];
  const latencies: number[] = [];
  for (let i = 0; i < msgs.length; i++) {
    if (i === 0) {
      burst = 1;
      continue;
    }
    const gap = (Date.parse(msgs[i].createdAt) - Date.parse(msgs[i - 1].createdAt)) / 1000;
    gaps.push(gap);
    if (msgs[i].participantId !== msgs[i - 1].participantId) {
      switches++;
      latencies.push(gap);
      bursts.push(burst);
      burst = 1;
    } else {
      burst++;
    }
  }
  if (msgs.length) bursts.push(burst);

  // Per speaker
  const speakers = new Map<string, { messages: number; words: number[]; short: boolean[] }>();
  msgs.forEach((m, i) => {
    const entry = speakers.get(m.speaker) ?? { messages: 0, words: [], short: [] };
    entry.messages++;
    entry.words.push(features[i].words);
    entry.short.push(features[i].lengthClass === "short");
    speakers.set(m.speaker, entry);
  });
  const perSpeaker = [...speakers.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([speaker, e]) => ({
      speaker,
      messages: e.messages,
      words: e.words.reduce((a, b) => a + b, 0),
      meanWords: mean(e.words),
      shortShare: share(e.short),
    }));

  // Messages per minute of the session
  const perMinute: number[] = [];
  if (start !== null) {
    const minutes = Math.max(1, Math.ceil((actualDurationSec ?? input.plannedDurationSec) / 60));
    for (let i = 0; i < minutes; i++) perMinute.push(0);
    for (const m of msgs) {
      const idx = Math.floor((Date.parse(m.createdAt) - start) / 60000);
      if (idx >= 0 && idx < perMinute.length) perMinute[idx]++;
      else if (idx >= perMinute.length) perMinute[perMinute.length - 1]++;
    }
  }

  const durationMin = (actualDurationSec ?? 0) / 60;
  return {
    version: 1,
    computedAt: new Date().toISOString(),
    plannedDurationSec: input.plannedDurationSec,
    actualDurationSec,
    speakers: speakers.size,
    messages: msgs.length,
    operatorMessages: input.operatorMessages,
    words: words.reduce((a, b) => a + b, 0),
    messagesPerMinute: durationMin > 0 ? msgs.length / durationMin : null,
    wordsPerMessage: { mean: mean(words), median: median(words), sd: sd(words) },
    charsPerMessage: { mean: mean(chars), median: median(chars), sd: sd(chars) },
    shares: {
      short: share(features.map((f) => f.lengthClass === "short")),
      question: share(features.map((f) => f.question)),
      exclamation: share(features.map((f) => f.exclamation)),
      emoji: share(features.map((f) => f.emoji)),
      laughter: share(features.map((f) => f.laughter)),
      slang: share(features.map((f) => f.slang)),
      firstPerson: share(features.map((f) => f.firstPerson)),
      startsLowercase: share(features.map((f) => f.startsLowercase)),
      endsWithPunctuation: share(features.map((f) => f.endsWithPunctuation)),
      allLowercase: share(features.map((f) => f.allLowercase)),
    },
    typeTokenRatio: allTokens.length ? unique.size / allTokens.length : null,
    uniqueWords: unique.size,
    speakerSwitchRate: msgs.length > 1 ? switches / (msgs.length - 1) : null,
    meanBurstLength: mean(bursts),
    gapSeconds: { median: median(gaps), mean: mean(gaps), p90: quantile(gaps, 0.9) },
    responseLatencySeconds: { median: median(latencies), mean: mean(latencies) },
    participation: {
      entropy: normalisedEntropy(perSpeaker.map((s) => s.messages)),
      gini: gini(perSpeaker.map((s) => s.messages)),
    },
    perSpeaker,
    perMinute,
  };
}
