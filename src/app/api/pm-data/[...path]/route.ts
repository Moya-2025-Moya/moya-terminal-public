// Authed forward to Polymarket's data-api via the droplet proxy (NL egress).
// Used for read-only portfolio data (positions, pnl, activity) keyed by wallet
// address. Bearer added server-side.
import { makeForwarder } from "@/lib/pm-forward";

const forward = makeForwarder("data-api");

export const GET = forward;
export const POST = forward;
