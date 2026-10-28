// Surface features of a single chat message. These describe the human baseline
// in each session and are compared between original and AI-written messages.

import { SHORT_MAX_WORDS } from "../constants";

const TOKEN_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*|\p{Extended_Pictographic}/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const LAUGH_RE = /\b(?:l+o+l+z?|lmf?a+o+|rofl|a?(?:ha){2,}h?|he(?:he)+|xd)\b|😂|🤣|💀|😭/iu;
const ELONGATION_RE = /(\p{L})\1{2,}/u;
const FIRST_PERSON = new Set([
  "i", "i'm", "im", "me", "my", "mine", "myself", "i've", "ive", "i'd", "i'll", "id", "ill",
  "i’m", "i’ve", "i’d", "i’ll",
]);
const SLANG = new Set([
  "lol", "lmao", "lmfao", "idk", "tbh", "ngl", "imo", "imho", "fr", "rn", "omg", "btw", "smh",
  "u", "ur", "ya", "yeah", "yea", "yep", "yup", "nah", "nope", "gonna", "wanna", "gotta", "kinda",
  "sorta", "dunno", "lowkey", "highkey", "deadass", "bro", "bruh", "dude", "mate", "legit", "lit",
  "vibe", "vibes", "sus", "cap", "bet", "tho", "thx", "pls", "plz", "ok", "okay", "k", "kk", "oof",
  "haha", "hahaha", "aha", "ahaha", "hehe", "xd", "wtf", "af", "irl", "goat", "cuz", "coz", "bc",
  "abt", "w", "wbu", "hbu", "nvm", "jk", "tbf", "iirc", "ty", "np", "ikr", "obv", "def", "prob",
]);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []).map((t) => t.replace(/’/g, "'"));
}

export function wordCount(text: string): number {
  return tokenize(text).length;
}

export type LengthClass = "short" | "longer";

export function lengthClass(text: string): LengthClass {
  return wordCount(text) <= SHORT_MAX_WORDS ? "short" : "longer";
}

export interface MessageFeatures {
  words: number;
  chars: number;
  lengthClass: LengthClass;
  question: boolean;
  exclamation: boolean;
  emoji: boolean;
  emojiCount: number;
  laughter: boolean;
  slang: boolean;
  firstPerson: boolean;
  startsLowercase: boolean;
  startsCapital: boolean;
  endsWithPunctuation: boolean;
  endsWithPeriod: boolean;
  allLowercase: boolean;
  elongation: boolean;
  contraction: boolean;
  multiSentence: boolean;
}

export function messageFeatures(text: string): MessageFeatures {
  const trimmed = text.trim();
  const tokens = tokenize(trimmed);
  const letters = trimmed.match(/\p{L}/gu) ?? [];
  const firstLetter = trimmed.match(/\p{L}/u)?.[0] ?? "";
  const emojiCount = (trimmed.match(EMOJI_RE) ?? []).length;
  const sentenceBreaks = (trimmed.match(/[.!?]+(?=\s+\p{L})/gu) ?? []).length;
  return {
    words: tokens.length,
    chars: Array.from(trimmed).length,
    lengthClass: tokens.length <= SHORT_MAX_WORDS ? "short" : "longer",
    question: trimmed.includes("?"),
    exclamation: trimmed.includes("!"),
    emoji: emojiCount > 0,
    emojiCount,
    laughter: LAUGH_RE.test(trimmed),
    slang: tokens.some((t) => SLANG.has(t)),
    firstPerson: tokens.some((t) => FIRST_PERSON.has(t)),
    startsLowercase: firstLetter !== "" && firstLetter === firstLetter.toLowerCase() && firstLetter !== firstLetter.toUpperCase(),
    startsCapital: firstLetter !== "" && firstLetter === firstLetter.toUpperCase() && firstLetter !== firstLetter.toLowerCase(),
    endsWithPunctuation: /[.!?…]["')\]]*$/u.test(trimmed),
    endsWithPeriod: /(?<!\.)\.["')\]]*$/u.test(trimmed),
    allLowercase: letters.length > 0 && letters.every((c) => c === c.toLowerCase()),
    elongation: ELONGATION_RE.test(trimmed),
    contraction: /\p{L}['’]\p{L}/u.test(trimmed),
    multiSentence: sentenceBreaks > 0,
  };
}

// Binary features reported as proportions in style comparisons.
export const BINARY_FEATURES: { key: keyof MessageFeatures; label: string }[] = [
  { key: "question", label: "Contains a question mark" },
  { key: "exclamation", label: "Contains an exclamation mark" },
  { key: "emoji", label: "Contains emoji" },
  { key: "laughter", label: "Laughter token (lol, haha, 😂)" },
  { key: "slang", label: "Slang / chat abbreviation" },
  { key: "firstPerson", label: "First-person reference (I, me, my)" },
  { key: "startsCapital", label: "Starts with a capital letter" },
  { key: "allLowercase", label: "All lowercase" },
  { key: "endsWithPunctuation", label: "Ends with . ! ? or …" },
  { key: "endsWithPeriod", label: "Ends with a full stop" },
  { key: "contraction", label: "Uses a contraction" },
  { key: "elongation", label: "Letter elongation (sooo)" },
  { key: "multiSentence", label: "More than one sentence" },
];
