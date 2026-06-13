// Authed forward to the CLOB via the droplet proxy. The browser (clob-client)
// signs orders L1 and computes L2 HMAC headers, but must NOT hold our proxy
// bearer - so its calls go through here. clob-client uses host "/api/pm" and
// HMACs the bare endpoint path, so the prefix doesn't affect the signature.
import { makeForwarder } from "@/lib/pm-forward";

const forward = makeForwarder("proxy");

export const GET = forward;
export const POST = forward;
export const DELETE = forward;
export const PUT = forward;
