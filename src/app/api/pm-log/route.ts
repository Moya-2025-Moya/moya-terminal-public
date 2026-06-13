// Trade-log sink. The droplet SQLite endpoint is still being built - for now
// this mock accepts the record and returns 200. When the infra-api log endpoint
// is ready, forward the body there (bearer added server-side) instead of mocking.
import { isAuthorizedRequest, unauthorizedJson } from "@/lib/auth";

const MAX_LOG_BYTES = 64 * 1024;

export async function POST(req: Request) {
  if (!(await isAuthorizedRequest(req))) {
    return unauthorizedJson();
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > MAX_LOG_BYTES) {
    return Response.json({ error: "trade log too large" }, { status: 413 });
  }

  try {
    const raw = await req.arrayBuffer();
    if (raw.byteLength > MAX_LOG_BYTES) {
      return Response.json({ error: "trade log too large" }, { status: 413 });
    }
    const body = JSON.parse(new TextDecoder().decode(raw));
    console.log("[trade-log]", JSON.stringify(body));
  } catch {
    /* ignore malformed body */
  }
  return Response.json({ ok: true });
}
