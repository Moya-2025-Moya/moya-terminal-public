// Authed forward to Polymarket's relayer (relayer-v2.polymarket.com) via the
// droplet proxy's /relay mount (NL egress, geo-block). Used for gasless Safe
// deployment + approvals (RelayClient). Bearer added server-side.
// NOTE: requires QA to add `/relay/* -> https://relayer-v2.polymarket.com/*`
// to polymarket-proxy (same pattern as /data-api).
import { makeForwarder } from "@/lib/pm-forward";

const forward = makeForwarder("relay");

export const GET = forward;
export const POST = forward;
export const PUT = forward;
