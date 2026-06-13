"use client";

import { useState } from "react";

// One-click connection details for wiring a bot's PnL in/out. The app is single-
// user behind the password gate, so showing your own keys here is fine; secrets
// are masked until revealed. "Copy setup" yields a paste-ready spec for a bot.
type Props = {
  ingestUrl: string;
  keyId: string;
  writeSecret: string;
  readKey: string;
  positionsReadKey: string;
};

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className={`shrink-0 rounded border px-2 py-1 text-[11px] uppercase tracking-wide transition-colors ${
        done ? "border-pos/40 bg-pos/15 text-pos" : "border-border text-muted hover:text-foreground"
      }`}
    >
      {done ? "Copied" : label}
    </button>
  );
}

function Field({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [show, setShow] = useState(false);
  const display = !value ? "(not set)" : secret && !show ? "•".repeat(Math.min(28, value.length)) : value;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-faint">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground" title={value}>{display}</code>
      {secret && value && (
        <button onClick={() => setShow((s) => !s)} className="shrink-0 text-[11px] text-faint hover:text-foreground">
          {show ? "hide" : "show"}
        </button>
      )}
      {value && <CopyBtn text={value} />}
    </div>
  );
}

export function PnlIntegration({ ingestUrl, keyId, writeSecret, readKey, positionsReadKey }: Props) {
  const base = ingestUrl.replace(/\/$/, "");
  const configured = Boolean(keyId && writeSecret);

  const inboundSpec = `# Report your bot's PnL to Moya terminal (inbound)

POST ${base}/pnl/ingest

Sign every request (HMAC-SHA256):
  X-Pnl-Key:        ${keyId || "<key_id>"}
  X-Pnl-Timestamp:  <unix_seconds>
  X-Pnl-Signature:  base64url( HMAC_SHA256( key_secret, \`\${timestamp}POST/pnl/ingest\${rawBody}\` ) )
  Content-Type:     application/json

key_id:     ${keyId || "<key_id>"}
key_secret: ${writeSecret || "<key_secret>"}   # base64; |now - ts| must be <= 300s

Body (USD floats, ts in unix seconds, cumulative point-in-time state):
{
  "source": "bot:YOUR_BOT",      // stable unique id per bot/account
  "strategy": "YOUR_STRATEGY",   // groups bots
  "ts": 1760000000,
  "equity": 12450.32,            // total account value
  "realized_pnl": 840.10,        // cumulative realized
  "unrealized_pnl": 120.55,      // current open PnL
  "cash": 3000.00                // optional
}
Send an array to batch (up to 500). (source, ts) is idempotent — safe retries.`;

  const outboundSpec = `# Read aggregated PnL out of Moya terminal (outbound)

Auth (read-only bearer):
  Authorization: Bearer ${readKey || "<read_key>"}

GET ${base}/pnl/summary
GET ${base}/pnl/series?metric=equity&interval=1h     // metric: equity|realized|unrealized|total_pnl

Positions (read:positions key):
  Authorization: Bearer ${positionsReadKey || "<positions_read_key>"}
  GET ${base}/positions?status=open

Amounts are USD floats; ts is unix seconds; values are cumulative point-in-time.
Total = sum of each source's latest value per bucket (never re-accumulate).`;

  return (
    <div className="space-y-4">
      {!configured && (
        <div className="rounded-lg border border-warn/40 bg-warn/[0.06] px-4 py-2.5 text-xs text-warn">
          PnL keys aren&apos;t set on this deploy yet. Set POLY_PNL_WRITE_KEY_ID / POLY_PNL_WRITE_SECRET /
          POLY_PNL_READ_KEY in Railway to populate these.
        </div>
      )}

      {/* Inbound */}
      <div className="rounded-xl border border-hairline bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Bots report PnL (inbound)</div>
            <div className="text-[11px] text-faint">Hand this to a bot so it pushes its PnL to the terminal.</div>
          </div>
          <CopyBtn text={inboundSpec} label="Copy setup" />
        </div>
        <div className="space-y-2 border-t border-hairline pt-3">
          <Field label="Endpoint" value={`${base}/pnl/ingest`} />
          <Field label="Key id" value={keyId} />
          <Field label="Key secret" value={writeSecret} secret />
        </div>
      </div>

      {/* Outbound */}
      <div className="rounded-xl border border-hairline bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">Read PnL out (outbound)</div>
            <div className="text-[11px] text-faint">Give a dashboard / site read-only access to your aggregated PnL.</div>
          </div>
          <CopyBtn text={outboundSpec} label="Copy setup" />
        </div>
        <div className="space-y-2 border-t border-hairline pt-3">
          <Field label="Summary" value={`${base}/pnl/summary`} />
          <Field label="Series" value={`${base}/pnl/series?metric=equity&interval=1h`} />
          <Field label="Read key" value={readKey} secret />
          <Field label="Positions key" value={positionsReadKey} secret />
        </div>
      </div>
    </div>
  );
}
