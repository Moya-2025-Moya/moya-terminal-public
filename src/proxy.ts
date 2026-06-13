import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken, safeFrom } from "@/lib/auth";

// Gate every route behind the single TERMINAL_PASSWORD. Unauthenticated requests
// are sent to /login. If TERMINAL_PASSWORD is unset we fail closed, so a missing
// production env var cannot expose the terminal.
// Next 16 "proxy" convention (formerly middleware).
export async function proxy(req: NextRequest) {
  const password = process.env.TERMINAL_PASSWORD;

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (password && token && token === (await authToken(password))) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", safeFrom(`${req.nextUrl.pathname}${req.nextUrl.search}`));
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page, Next internals, and static assets.
  matcher: ["/((?!(?:login(?:/|$)|_next/static|_next/image|favicon.ico)).*)"],
};
