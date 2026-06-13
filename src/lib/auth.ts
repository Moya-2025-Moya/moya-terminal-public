// Single-password access gate. The auth cookie holds a SHA-256 token derived
// from TERMINAL_PASSWORD (never the password itself), so middleware can validate
// statelessly and the cookie auto-invalidates if the password changes.
// crypto.subtle is available in both the Edge (middleware) and Node runtimes.

export const AUTH_COOKIE = "moya_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function authToken(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`moya-terminal:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Only allow same-site internal redirect targets. */
export function safeFrom(from: string | null | undefined): string {
  if (!from) return "/";
  try {
    const url = new URL(from, "https://moya-terminal.local");
    if (url.origin !== "https://moya-terminal.local") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey !== name) continue;
    try {
      return decodeURIComponent(rawValue.join("="));
    } catch {
      return rawValue.join("=");
    }
  }
  return null;
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.TERMINAL_PASSWORD);
}

export async function isValidAuthToken(token: string | null | undefined) {
  const password = process.env.TERMINAL_PASSWORD;
  if (!password || !token) return false;
  return token === (await authToken(password));
}

export async function isAuthorizedRequest(req: Request): Promise<boolean> {
  return isValidAuthToken(cookieValue(req.headers.get("cookie"), AUTH_COOKIE));
}

export async function unauthorizedJson() {
  const status = isAuthConfigured() ? 401 : 503;
  const error = isAuthConfigured()
    ? "authentication required"
    : "terminal auth not configured";
  return Response.json({ error }, { status });
}
