import { isAuthorizedRequest, unauthorizedJson } from "./auth";
import crypto from "crypto";

// Shared authed forward to the droplet polymarket-proxy. Adds our bearer
// (server-side) and forwards method + POLY_* L2 headers + RAW body verbatim to
// {POLYMARKET_PROXY_URL}/<mount>/<path>. Body is untouched so Polymarket's L2
// HMAC (computed over the exact body) stays valid.
//   mount "proxy"    → clob.polymarket.com   (markets, orders - clob-client)
//   mount "data-api" → data-api.polymarket.com (positions, pnl, activity)

const BASE = process.env.POLYMARKET_PROXY_URL;
const TOKEN = process.env.INFRA_API_TOKEN;
const BUILDER_KEY = process.env.POLY_BUILDER_API_KEY;
const BUILDER_SECRET = process.env.POLY_BUILDER_SECRET;
const BUILDER_PASSPHRASE = process.env.POLY_BUILDER_PASSPHRASE;

const PASS_THROUGH = new Set([
  "poly_address",
  "poly_signature",
  "poly_timestamp",
  "poly_api_key",
  "poly_passphrase",
  "poly_nonce",
  "poly_builder_api_key",
  "poly_builder_passphrase",
  "poly_builder_signature",
  "poly_builder_timestamp",
  "content-type",
  "accept",
]);

function builderSignature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string,
) {
  const message = `${timestamp}${method}${requestPath}${body ?? ""}`;
  return crypto
    .createHmac("sha256", Buffer.from(secret, "base64"))
    .update(message)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}

function addBuilderHeaders(
  headers: Record<string, string>,
  method: string,
  requestPath: string,
  body?: Uint8Array,
) {
  if (!BUILDER_KEY || !BUILDER_SECRET || !BUILDER_PASSPHRASE) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const bodyText = body ? new TextDecoder().decode(body) : undefined;
  headers.POLY_BUILDER_API_KEY = BUILDER_KEY;
  headers.POLY_BUILDER_PASSPHRASE = BUILDER_PASSPHRASE;
  headers.POLY_BUILDER_TIMESTAMP = String(timestamp);
  headers.POLY_BUILDER_SIGNATURE = builderSignature(
    BUILDER_SECRET,
    timestamp,
    method,
    requestPath,
    bodyText,
  );
}

function targetUrl(
  base: string,
  mount: "proxy" | "data-api" | "relay",
  path: string[] | undefined,
  search: string,
) {
  if (!path?.length) throw new Error("missing proxy path");
  const baseUrl = new URL(base);
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("invalid proxy protocol");
  }

  const encodedPath = path.map((segment) => {
    if (!segment || segment === "." || segment === "..") {
      throw new Error("invalid proxy path segment");
    }
    if (segment.includes("/") || segment.includes("\\")) {
      throw new Error("invalid proxy path segment");
    }
    return encodeURIComponent(segment);
  });

  const pathname = [baseUrl.pathname.replace(/\/+$/, ""), mount, ...encodedPath]
    .filter(Boolean)
    .join("/");
  baseUrl.pathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  baseUrl.search = search;
  return baseUrl.toString();
}

export function makeForwarder(mount: "proxy" | "data-api" | "relay") {
  return async function forward(
    req: Request,
    ctx: { params: Promise<{ path: string[] }> },
  ) {
    if (!(await isAuthorizedRequest(req))) {
      return unauthorizedJson();
    }
    if (!BASE || !TOKEN) {
      return Response.json(
        { error: "polymarket proxy not configured" },
        { status: 503 },
      );
    }
    const { path } = await ctx.params;
    const url = new URL(req.url);
    let target: string;
    try {
      target = targetUrl(BASE, mount, path, url.search);
    } catch (e) {
      return Response.json(
        { error: "invalid proxy target", detail: e instanceof Error ? e.message : String(e) },
        { status: 400 },
      );
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` };
    req.headers.forEach((value, key) => {
      if (PASS_THROUGH.has(key.toLowerCase())) headers[key] = value;
    });

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? new Uint8Array(await req.arrayBuffer()) : undefined;
    if (mount === "relay") {
      addBuilderHeaders(headers, req.method, `/${path.join("/")}`, body);
    }

    try {
      const upstream = await fetch(target, {
        method: req.method,
        headers,
        body: body && body.byteLength ? body : undefined,
        cache: "no-store",
      });
      const buf = await upstream.arrayBuffer();
      return new Response(buf, {
        status: upstream.status,
        headers: {
          "content-type":
            upstream.headers.get("content-type") || "application/json",
        },
      });
    } catch (e) {
      return Response.json(
        { error: "proxy request failed", detail: e instanceof Error ? e.message : String(e) },
        { status: 502 },
      );
    }
  };
}
