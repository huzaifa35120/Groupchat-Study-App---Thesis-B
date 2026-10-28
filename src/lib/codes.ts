// Join codes for groups and private access codes for participants.
import { createHash, randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomString(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

export function newGroupCode(): string {
  return randomString(6);
}

export function newAccessCode(): string {
  const raw = randomString(12);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function normaliseCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashAccessCode(code: string): string {
  return createHash("sha256").update(`groupchat-study:${normaliseCode(code)}`).digest("hex");
}
