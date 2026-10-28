// Study-wide constants: consent items, scoring rubric, failure categories,
// message types and the AI-detection cues they map onto.

export const DEFAULT_MODEL = "claude-opus-5";
export const OPERATOR_LABEL = "Moderator";
export const SHORT_MAX_WORDS = 3;
export const DEFAULT_SESSION_SECONDS = 600;

export const CONSENT_VERSION = "2025-08-21";
export const CONSENT_ITEMS = [
  { id: "read", text: "I have read and understood the information above." },
  { id: "questions", text: "I have had the chance to ask questions and they've been answered." },
  {
    id: "recorded",
    text: "I understand the chat sessions will be recorded and that some of my messages will later be replaced with AI-generated text for comparison.",
  },
  {
    id: "pseudonym",
    text: "I understand I'll use a made-up name and that no real identifying details are collected.",
  },
  {
    id: "voluntary",
    text: "I understand taking part is voluntary and I can withdraw at any time without giving a reason and without consequence.",
  },
  { id: "withdrawDeletes", text: "I understand withdrawing means all of my conversations are deleted." },
  { id: "adult", text: "I am 18 years or older." },
  { id: "agree", text: "I agree to take part in this study." },
] as const;

export const RUBRIC = [
  { score: 3, label: "Same meaning, similar style" },
  { score: 2, label: "Same meaning, different style" },
  { score: 1, label: "Different meaning but still fits" },
  { score: 0, label: "Doesn't fit at all" },
] as const;

// Cues people report when they spot AI-written text (Background / Aim 3).
export const AI_CUES = [
  { id: "tone", label: "Tone", description: "Tone that doesn't match the people or the moment" },
  { id: "formality", label: "Formality", description: "Too polished, complete or formal for casual chat" },
  { id: "impersonal", label: "No personal sharing", description: "Generic, avoids opinions, experiences or self-reference" },
  { id: "shape", label: "Uniform shape", description: "Messages all similar in length and structure" },
  { id: "context", label: "Shared context", description: "Misses in-group references the humans rely on" },
] as const;
export type CueId = (typeof AI_CUES)[number]["id"];

export const FAILURE_TAGS = [
  { id: "wrong_tone", label: "Wrong tone", cue: "tone", description: "Emotion, energy or attitude doesn't match the speaker or moment" },
  { id: "too_formal", label: "Too formal / polished", cue: "formality", description: "Grammar, punctuation or vocabulary more formal than the chat" },
  { id: "over_explaining", label: "Over-explaining", cue: "formality", description: "Says more than needed, spells out what humans leave implicit" },
  { id: "generic_impersonal", label: "Generic / impersonal", cue: "impersonal", description: "Bland, avoids personal opinion or experience the original shared" },
  { id: "wrong_length", label: "Wrong length / shape", cue: "shape", description: "Much longer or shorter than the original, or a different structure" },
  { id: "missed_shared_context", label: "Missed shared context", cue: "context", description: "Ignores something established earlier in the chat" },
  { id: "missed_running_joke", label: "Missed running joke", cue: "context", description: "Fails to pick up an ongoing joke or banter" },
  { id: "wrong_intent", label: "Wrong intent", cue: null, description: "Different speech act (e.g. asks instead of answers)" },
  { id: "off_topic", label: "Off topic", cue: null, description: "Moves somewhere the conversation wasn't going" },
  { id: "other", label: "Other", cue: null, description: "Anything not covered above (explain in notes)" },
] as const satisfies readonly { id: string; label: string; cue: CueId | null; description: string }[];
export type FailureTagId = (typeof FAILURE_TAGS)[number]["id"];
export const FAILURE_TAG_IDS = FAILURE_TAGS.map((t) => t.id) as [FailureTagId, ...FailureTagId[]];

// Functional message types (what the message is doing in the conversation)
export const MSG_TYPES = [
  { id: "reaction", label: "Reaction / backchannel", description: "lol, true, same, emoji, agreement noises" },
  { id: "question", label: "Question", description: "Asks something of the group" },
  { id: "answer", label: "Answer / reply", description: "Directly responds to a question" },
  { id: "opinion", label: "Opinion / claim", description: "States a view or makes a point" },
  { id: "personal_share", label: "Personal share", description: "Anecdote or detail about the speaker's own life" },
  { id: "joke_banter", label: "Joke / banter", description: "Humour, teasing, running jokes" },
  { id: "topic_shift", label: "Topic shift", description: "Moves the conversation somewhere new" },
  { id: "coordination", label: "Coordination", description: "Talk about the chat itself (who's here, time left)" },
  { id: "other", label: "Other", description: "None of the above" },
] as const;
export type MsgTypeId = (typeof MSG_TYPES)[number]["id"];
export const MSG_TYPE_IDS = MSG_TYPES.map((t) => t.id) as [MsgTypeId, ...MsgTypeId[]];

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

export const TOPIC_SUGGESTIONS = [
  "Plan the perfect weekend in Sydney on a $100 budget.",
  "If you could add one thing to campus, what would it be and why?",
  "What's a food everyone loves that you think is overrated (or underrated)?",
];

export function tagLabel(id: string) {
  return FAILURE_TAGS.find((t) => t.id === id)?.label ?? id;
}
export function typeLabel(id: string | null | undefined) {
  if (!id) return "Unclassified";
  return MSG_TYPES.find((t) => t.id === id)?.label ?? id;
}
