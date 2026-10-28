"use client";
// The participant's access code lives in this browser's localStorage, keyed by group.

export interface StoredAccess {
  accessCode: string;
  pseudonym: string;
}

const key = (groupCode: string) => `gcs:access:${groupCode.toUpperCase()}`;

export function loadAccess(groupCode: string): StoredAccess | null {
  try {
    const raw = localStorage.getItem(key(groupCode));
    return raw ? (JSON.parse(raw) as StoredAccess) : null;
  } catch {
    return null;
  }
}

export function saveAccess(groupCode: string, access: StoredAccess) {
  try {
    localStorage.setItem(key(groupCode), JSON.stringify(access));
  } catch {
    // Private mode etc.: the participant can still re-enter their code.
  }
}

export function clearAccess(groupCode: string) {
  try {
    localStorage.removeItem(key(groupCode));
  } catch {}
}
