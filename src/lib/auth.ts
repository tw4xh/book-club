import { cookies } from "next/headers";
import crypto from "node:crypto";
import { getUserById } from "./repo";
import type { User } from "./types";

const SESSION_COOKIE = "session";
const ACTIVE_GROUP_COOKIE = "active_group";
const SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
const MAX_AGE = 60 * 60 * 24 * 60; // 60 days

function sign(value: string): string {
  const sig = crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
  return `${value}.${sig}`;
}

function unsign(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto
    .createHmac("sha256", SECRET)
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
  return getUserById(userId) ?? null;
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

export async function getActiveGroupId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACTIVE_GROUP_COOKIE)?.value ?? null;
}
