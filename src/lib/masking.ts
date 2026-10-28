// Gap selection. Rules from the project plan:
//  - about 20% of messages are hidden
//  - never one of the first three messages
//  - never two gaps in a row, so there is always context on both sides
//  - (and never the final message, for the same reason)
// Operator (moderator) messages are never eligible. Adjacency is judged on the
// participant-only sequence, so an operator message between two participant
// messages does not make them "not in a row".

import { mulberry32 } from "./analysis/stats";
import type { LengthClass } from "./text/features";

export interface MaskOptions {
  ratio: number;
  seed: number;
  skipFirst: number;
  protectLast: boolean;
  noAdjacent: boolean;
  stratify: boolean;
}

export const DEFAULT_MASK_OPTIONS: MaskOptions = {
  ratio: 0.2,
  seed: 4093,
  skipFirst: 3,
  protectLast: true,
  noAdjacent: true,
  stratify: false,
};

export interface MaskCandidate {
  id: number;
  isOperator: boolean;
  lengthClass: LengthClass;
}

export interface MaskSelection {
  ids: number[];
  participantMessages: number;
  eligible: number;
  target: number;
  warnings: string[];
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function selectMasks(messages: MaskCandidate[], options: MaskOptions): MaskSelection {
  const seq = messages.filter((m) => !m.isOperator);
  const n = seq.length;
  const target = Math.round(options.ratio * n);
  const eligibleIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < options.skipFirst) continue;
    if (options.protectLast && i === n - 1) continue;
    eligibleIdx.push(i);
  }

  const rand = mulberry32(options.seed);
  const chosen = new Set<number>();
  const canTake = (i: number) => !options.noAdjacent || (!chosen.has(i - 1) && !chosen.has(i + 1));

  const takeFrom = (pool: number[], limit: number) => {
    let taken = 0;
    for (const i of shuffle(pool, rand)) {
      if (taken >= limit || chosen.size >= target) break;
      if (!chosen.has(i) && canTake(i)) {
        chosen.add(i);
        taken++;
      }
    }
  };

  if (options.stratify) {
    const classes: LengthClass[] = ["short", "longer"];
    for (const cls of classes) {
      const pool = eligibleIdx.filter((i) => seq[i].lengthClass === cls);
      const quota = Math.round((pool.length / Math.max(1, eligibleIdx.length)) * target);
      takeFrom(pool, quota);
    }
  }
  takeFrom(eligibleIdx, target - chosen.size);

  const warnings: string[] = [];
  if (chosen.size < target) {
    warnings.push(
      `Only ${chosen.size} of the target ${target} gaps could be placed under the spacing rules (${eligibleIdx.length} eligible messages).`,
    );
  }
  const ids = [...chosen].sort((a, b) => a - b).map((i) => seq[i].id);
  return { ids, participantMessages: n, eligible: eligibleIdx.length, target, warnings };
}

// Checks a (possibly hand-edited) set of gaps against the rules.
export function validateMasks(messages: MaskCandidate[], maskedIds: Set<number>, options: MaskOptions): string[] {
  const seq = messages.filter((m) => !m.isOperator);
  const warnings: string[] = [];
  seq.forEach((m, i) => {
    if (!maskedIds.has(m.id)) return;
    if (i < options.skipFirst) warnings.push(`Message #${i + 1} is one of the first ${options.skipFirst} messages.`);
    if (options.protectLast && i === seq.length - 1) warnings.push(`The final message is masked (no context after it).`);
    if (options.noAdjacent && i > 0 && maskedIds.has(seq[i - 1].id)) {
      warnings.push(`Messages #${i} and #${i + 1} are consecutive gaps.`);
    }
  });
  if (messages.some((m) => m.isOperator && maskedIds.has(m.id))) warnings.push("A moderator message is masked.");
  return warnings;
}
