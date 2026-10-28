// Builds the exact text sent to the model for each gap. The prompt is stored
// with every prediction so the thesis can report precisely what the model saw.

import type { Effort } from "../constants";
import { OPERATOR_LABEL } from "../constants";

export interface RunConfig {
  effort: Effort;
  contextMode: "bidirectional" | "preceding";
  windowBefore: number | null; // null = everything
  windowAfter: number | null;
  otherGaps: "visible" | "hidden";
  revealSpeaker: boolean;
  includeOperator: boolean;
  includeTopic: boolean;
  includeTimestamps: boolean;
  anonymiseSpeakers: boolean; // send "Speaker 1" etc. instead of the made-up names
  systemPrompt: string;
  promptVersion: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are helping with a research study on how closely AI-written text can match real human messages in a casual group chat.

You will see a transcript of a group chat between real people using made-up names. One message has been removed and marked <<GAP>>. Write the message that was most likely sent at that point.

Write it the way that person would actually type it in this chat: match their usual length, tone, slang, punctuation, capitalisation and emoji habits, and make it fit naturally with the surrounding conversation. Don't make it more polished, formal or complete than a real chat message would be.

Return only the message text itself.`;

export const DEFAULT_RUN_CONFIG: RunConfig = {
  effort: "high",
  contextMode: "bidirectional",
  windowBefore: null,
  windowAfter: null,
  otherGaps: "visible",
  revealSpeaker: true,
  includeOperator: true,
  includeTopic: true,
  includeTimestamps: false,
  anonymiseSpeakers: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  promptVersion: "v1",
};

export interface PromptMessage {
  id: number;
  author: string;
  body: string;
  isOperator: boolean;
  isMasked: boolean;
  createdAt: string;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export interface BuiltPrompt {
  user: string;
  contextBefore: number;
  contextAfter: number;
  speaker: string;
}

export function buildPredictionPrompt(args: {
  topic: string;
  messages: PromptMessage[];
  targetId: number;
  config: RunConfig;
  instruction?: boolean;
}): BuiltPrompt {
  const { config } = args;
  const all = args.messages.filter((m) => config.includeOperator || !m.isOperator || m.id === args.targetId);
  const targetIndex = all.findIndex((m) => m.id === args.targetId);
  if (targetIndex < 0) throw new Error(`Message ${args.targetId} not found in transcript`);
  const target = all[targetIndex];

  const startBefore = config.windowBefore === null ? 0 : Math.max(0, targetIndex - config.windowBefore);
  const endAfter =
    config.contextMode === "preceding"
      ? targetIndex
      : config.windowAfter === null
        ? all.length - 1
        : Math.min(all.length - 1, targetIndex + config.windowAfter);
  const slice = all.slice(startBefore, endAfter + 1);
  const t0 = Date.parse(all[0]?.createdAt ?? target.createdAt);

  const participants = [...new Set(all.filter((m) => !m.isOperator).map((m) => m.author))];

  const lines = slice.map((m) => {
    const name = m.isOperator ? `${OPERATOR_LABEL} (researcher)` : m.author;
    const time = config.includeTimestamps ? `[${clock(Date.parse(m.createdAt) - t0)}] ` : "";
    if (m.id === target.id) {
      return `${time}${config.revealSpeaker ? target.author : "???"}: <<GAP>>`;
    }
    if (m.isMasked && config.otherGaps === "hidden") return `${time}${name}: [message hidden]`;
    return `${time}${name}: ${m.body}`;
  });

  const parts: string[] = [];
  if (config.includeTopic) parts.push(`Chat topic given to the group: ${args.topic}`);
  parts.push(`People in the chat: ${participants.join(", ")}`);
  if (config.includeOperator && all.some((m) => m.isOperator)) {
    parts.push(`Messages from "${OPERATOR_LABEL} (researcher)" are from the person running the session, not a participant.`);
  }
  if (config.includeTimestamps) parts.push("Times are minutes:seconds since the chat started.");
  if (startBefore > 0) parts.push(`(The transcript starts partway through the chat.)`);
  parts.push("");
  parts.push("<transcript>");
  parts.push(...lines);
  parts.push("</transcript>");
  parts.push("");
  if (config.contextMode === "preceding") {
    parts.push("The transcript ends at the gap; you cannot see what came after it.");
  } else if (endAfter < all.length - 1) {
    parts.push("(The chat continued after the end of this excerpt.)");
  }
  if (args.instruction !== false) {
    parts.push(
      config.revealSpeaker
        ? `Write the message ${target.author} sent at <<GAP>>.`
        : "Write the message that was sent at <<GAP>>.",
    );
  }

  return {
    user: parts.join("\n"),
    contextBefore: targetIndex - startBefore,
    contextAfter: endAfter - targetIndex,
    speaker: target.author,
  };
}

export const JUDGE_SYSTEM_PROMPT = `You are a careful research assistant scoring how closely an AI-written chat message matches the real message a person sent in a casual group chat.

You will see the chat transcript with the position marked <<GAP>>, the ORIGINAL message that was really sent there, and a CANDIDATE written by an AI that never saw the original.

Answer three questions about the CANDIDATE compared with the ORIGINAL:
1. same_meaning: Does it say essentially the same thing - same intent and content, even if worded differently? Minor differences in detail are fine; a different point, answer, opinion or speech act is not.
2. similar_style: Does it read like the same person typed it - similar length, tone, formality, slang, punctuation, capitalisation and emoji use?
3. fits_context: Ignoring the original, would it be a natural, plausible message at that point in this chat?

Then:
- failure_tags: every problem that applies (use an empty list if the candidate is a close match). Definitions:
  wrong_tone: emotion, energy or attitude doesn't match the speaker or moment
  too_formal: grammar, punctuation or vocabulary more formal than the chat
  over_explaining: says more than needed, spells out what people would leave implicit
  generic_impersonal: bland, avoids personal opinion or experience that the original shared
  wrong_length: much longer or shorter than the original, or a different structure
  missed_shared_context: ignores something established earlier in the chat
  missed_running_joke: fails to pick up an ongoing joke or banter
  wrong_intent: a different speech act (e.g. asks instead of answers)
  off_topic: moves somewhere the conversation wasn't going
  other: anything else (explain in the rationale)
- original_type: what the ORIGINAL message is doing in the conversation: reaction (lol, true, same, emoji), question, answer, opinion, personal_share, joke_banter, topic_shift, coordination (talk about the chat itself), or other.
- rationale: one or two sentences explaining your judgement.

Judge only what is in front of you. Very short reactions can match exactly; that is fine.`;

export function buildJudgePrompt(args: { transcriptPrompt: string; original: string; candidate: string }): string {
  return `${args.transcriptPrompt}

<original>${args.original}</original>
<candidate>${args.candidate}</candidate>`;
}

export function rubricScore(j: { same_meaning: boolean; similar_style: boolean; fits_context: boolean }): number {
  if (j.same_meaning) return j.similar_style ? 3 : 2;
  return j.fits_context ? 1 : 0;
}
