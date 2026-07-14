import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getUserById } from "./repo";
import type { User } from "./types";

const SESSION_COOKIE = "session";
const ACTIVE_GROUP_COOKIE = "active_group";
const DEMO_COOKIE = "demo";
const INSECURE_DEFAULT_SECRET = "dev-insecure-secret-change-me";
const MAX_AGE = 60 * 60 * 24 * 60; // 60 days

/**
 * Session-signing secret. In production a strong SESSION_SECRET is required —
 * without it, anyone could forge a login cookie. In development we allow an
 * insecure fallback for convenience.
 */
function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret === INSECURE_DEFAULT_SECRET) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET must be set to a strong, random value in production."
      );
    }
    return INSECURE_DEFAULT_SECRET;
  }
  return secret;
}

function sign(value: string): string {
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(value)
    .digest("base64url");
  return `${value}.${sig}`;
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(value)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ACTIVE_GROUP_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const userId = unsign(raw);
  if (!userId) return null;
  return (await getUserById(userId)) ?? null;
}

export async function setActiveGroup(groupId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_GROUP_COOKIE, groupId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearActiveGroup(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_GROUP_COOKIE);
}

export async function getActiveGroupId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_GROUP_COOKIE)?.value ?? null;
}

/** Marks the current session as a demo sandbox (stores the demo session token). */
export async function setDemoToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(DEMO_COOKIE, sign(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getDemoToken(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(DEMO_COOKIE)?.value;
  if (!raw) return null;
  return unsign(raw);
}

export async function clearDemoToken(): Promise<void> {
  const store = await cookies();
  store.delete(DEMO_COOKIE);
}
