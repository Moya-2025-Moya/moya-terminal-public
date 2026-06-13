import crypto from "crypto";
import { isAuthorizedRequest, unauthorizedJson } from "@/lib/auth";

// Server-side PnL snapshot writer. The browser sends a snapshot's values; we
// stamp the time, HMAC-sign with the write:pnl key (secret never reaches the
// client), and forward to the backend /pnl/ingest.

const BASE = process.env.INFRA_API_URL;
const KEY_ID = process.env.POLY_PNL_WRITE_KEY_ID;
const SECRET = process.env.POLY_PNL_WRITE_SECRET;

type Incoming = {
  source: string;
  strategy?: string;
  equity: number;
  realized_pnl?: number;
  unrealized_pnl?: number;
  cash?: number;
};

function sign(ts: number, body: string): string {
  return crypto
    .createHmac("sha256", Buffer.from(SECRET!, "base64"))
    .update(`${ts}POST/pnl/ingest${body}`)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

export async function POST(req: Request) {
  if (!(await isAuthorizedRequest(req))) return unauthorizedJson();
  if (!BASE || !KEY_ID || !SECRET) {
    return Response.json({ error: "pnl write not configured" }, { status: 503 });
  }

  let snap: Incoming;
  try {
    snap = (await req.json()) as Incoming;
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!snap?.source || !Number.isFinite(snap.equity)) {
    return Response.json({ error: "source + equity required" }, { status: 400 });
  }

  const ts = Math.floor(Date.now() / 1000);
  const payload = {
    source: snap.source,
    strategy: snap.strategy ?? snap.source,
    ts,
    equity: snap.equity,
    realized_pnl: Number.isFinite(snap.realized_pnl) ? snap.realized_pnl : 0,
    unrealized_pnl: Number.isFinite(snap.unrealized_pnl) ? snap.unrealized_pnl : 0,
    ...(Number.isFinite(snap.cash) ? { cash: snap.cash } : {}),
  };
  const body = JSON.stringify(payload);

  try {
    const upstream = await fetch(`${BASE}/pnl/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Pnl-Key": KEY_ID,
        "X-Pnl-Timestamp": String(ts),
        "X-Pnl-Signature": sign(ts, body),
      },
      body,
      cache: "no-store",
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return Response.json(
      { error: "ingest forward failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
