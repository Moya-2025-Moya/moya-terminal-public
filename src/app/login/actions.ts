"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, AUTH_MAX_AGE, authToken, safeFrom } from "@/lib/auth";

export type LoginState = { error: string } | null;

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") || "");
  const from = safeFrom(String(formData.get("from") || "/"));
  const expected = process.env.TERMINAL_PASSWORD;

  if (!expected) {
    return { error: "Access is not configured - set TERMINAL_PASSWORD." };
  }
  if (password !== expected) {
    return { error: "That password didn't match. Try again." };
  }

  const store = await cookies();
  store.set(AUTH_COOKIE, await authToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_MAX_AGE,
  });

  redirect(from);
}
