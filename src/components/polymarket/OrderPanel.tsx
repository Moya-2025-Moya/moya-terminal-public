"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWalletClient, useSwitchChain, useWriteContract } from "wagmi";
import { polygon } from "wagmi/chains";
import type { Address } from "viem";
import type { PmMarket, PmBook, PmPosition } from "@/lib/polymarket";
import {
  clobClient,
  deriveCreds,
  isAuthError,
  refreshCollateral,
  OrderType,
  Side,
  type ApiKeyCreds,
  type SignedOrder,
} from "@/lib/polymarket-client";
import type { OpenOrder } from "@polymarket/clob-client-v2";
import { withRetry, logTrade, mid, bestBid, bestAsk, expectedFill, nowMs, nowSec } from "@/lib/polymarket-exec";
import {
  depositWalletAddressFor,
  fundDepositWalletTx,
  pusdBalance,
} from "@/lib/polymarket-deposit-wallet";
import { loadCreds, saveCreds, clearCreds } from "@/lib/pm-session";
import { useOrderDraft } from "@/lib/pm-order-draft";
import { logActivity } from "@/lib/pm-activity";
import { DepositWalletOnboarding } from "./SafeOnboarding";

type Mode = "limit" | "market" | "lp";

const inputCls =
  "w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-sm text-foreground placeholder:text-faint focus:border-accent focus:outline-none";
const lbl = "mb-1 block text-[11px] uppercase tracking-[0.1em] text-muted";

const roundTick = (p: number, tick: number) =>
  tick > 0 ? Math.round(p / tick) * tick : p;

interface Leg {
  label: string;
  // Sign once (wallet popup) → SignedOrder. confirm() re-sends the SAME signed
  // order on retry, so retries are idempotent (no double-placement).
  sign: (c: ReturnType<typeof clobClient>) => Promise<SignedOrder>;
  orderType: OrderType;
  log: { side: string; price?: number; size: number };
}

export function OrderPanel({
  market,
  books,
}: {
  market?: PmMarket;
  books: Record<string, PmBook | null>;
}) {
  const { isConnected, chainId, address } = useAccount();
  const { data: wallet } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  // Polymarket routes orders through the user's deposit wallet (maker = wallet, POLY_1271).
  const [depositWallet, setDepositWallet] = useState<Address | null>(null);
  const [walletReady, setWalletReady] = useState(false);

  const [creds, setCreds] = useState<ApiKeyCreds | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [heldByToken, setHeldByToken] = useState<Record<string, number>>({});
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmt, setTopupAmt] = useState("20");
  const [topupBusy, setTopupBusy] = useState(false);

  const [mode, setMode] = useState<Mode>("limit");
  // Panel is keyed by market in the parent, so it remounts on market change and
  // this initializer re-runs - defaulting the outcome to the first (YES) token.
  const [tokenId, setTokenId] = useState(market?.tokens[0]?.token_id ?? "");
  const [side, setSide] = useState<Side>(Side.BUY);
  const [price, setPrice] = useState("0.50");
  const [size, setSize] = useState<string>(() => {
    if (typeof window === "undefined") return "20";
    try {
      return localStorage.getItem("pm_last_size") || "20";
    } catch {
      return "20";
    }
  });
  const [gtd, setGtd] = useState(false);
  const [expiryMin, setExpiryMin] = useState("60");
  const [spread, setSpread] = useState("0.04");

  const [pending, setPending] = useState<{ legs: Leg[]; summary: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  // Order-ticket prefill from clicking an order-book level (center column).
  const draft = useOrderDraft();
  const draftNonce = useRef(0);

  // Keyboard shortcuts: b/s switch side, Enter submits from within the ticket.
  const panelRef = useRef<HTMLDivElement>(null);
  const kbdRef = useRef<{ prepare: () => void; confirm: () => void; pending: boolean; busy: boolean }>({
    prepare: () => {},
    confirm: () => {},
    pending: false,
    busy: false,
  });

  const onPolygon = chainId === polygon.id;
  const tick = market?.minimum_tick_size ?? 0.01;
  const fmtPrice = useCallback(
    (v: number) => roundTick(v, tick).toFixed(tick < 0.01 ? 3 : 2),
    [tick],
  );

  const book = tokenId ? books[tokenId] : null;
  const m = mid(book);

  const refreshOrders = useCallback(
    async (c: ApiKeyCreds) => {
      if (!wallet || !depositWallet) return;
      try {
        setOrders(await clobClient(wallet, c, depositWallet).getOpenOrders());
      } catch (e) {
        // A stale/invalid cached key → drop it and fall back to "Enable trading".
        if (isAuthError(e)) {
          if (address) clearCreds(address);
          setCreds(null);
          setMsg({ ok: false, text: "API key was invalid - please Enable trading again." });
        }
        /* otherwise keep prior orders */
      }
    },
    [wallet, depositWallet, address],
  );

  // Load per-token holdings (for "sell Max" and the holding hint).
  const loadPositions = useCallback(async () => {
    if (!depositWallet) return;
    try {
      const r = await fetch(
        `/api/pm-data/positions?user=${depositWallet}&sizeThreshold=1&limit=200`,
        { cache: "no-store" },
      );
      if (!r.ok) return;
      const data: PmPosition[] = await r.json();
      const map: Record<string, number> = {};
      for (const p of data) map[p.asset] = p.size;
      setHeldByToken(map);
    } catch {
      /* keep prior */
    }
  }, [depositWallet]);

  // Spendable balance = on-chain deposit-wallet USDC.e (what the account strip shows). The
  // CLOB "collateral" reads 0 until approvals are set, so Max must not use it.
  const loadBalance = useCallback(async () => {
    if (!depositWallet) return;
    try {
      setBalance(await pusdBalance(depositWallet));
    } catch {
      /* keep prior */
    }
  }, [depositWallet]);

  // Apply a set of creds (cached or freshly derived): load orders + positions.
  const applyCreds = useCallback(
    async (c: ApiKeyCreds) => {
      if (!wallet) return;
      setCreds(c);
      await refreshOrders(c);
      loadPositions();
    },
    [wallet, refreshOrders, loadPositions],
  );

  // Session restore: if we already have a cached CLOB key for this wallet, use
  // it silently - no signing prompt on reload.
  useEffect(() => {
    if (!wallet || !address || creds) return;
    const cached = loadCreds(address);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) applyCreds(cached);
  }, [wallet, address, creds, applyCreds]);

  useEffect(() => {
    if (!wallet || !address) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDepositWallet(null);
      setWalletReady(false);
      return;
    }
    let cancelled = false;
    depositWalletAddressFor(wallet)
      .then((walletAddress) => {
        if (!cancelled) setDepositWallet(walletAddress);
      })
      .catch(() => {
        if (!cancelled) setDepositWallet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, address]);

  useEffect(() => {
    if (!creds || !depositWallet) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshOrders(creds);
    loadPositions();
    loadBalance();
    if (wallet) refreshCollateral(wallet, creds, depositWallet).catch(() => {});
  }, [wallet, creds, depositWallet, refreshOrders, loadPositions, loadBalance]);

  // Apply an order-book click: prefill outcome / side / price / size (limit).
  useEffect(() => {
    if (!draft || draft.nonce === draftNonce.current) return;
    if (!market?.tokens.some((t) => t.token_id === draft.tokenId)) return;
    draftNonce.current = draft.nonce;
    /* eslint-disable react-hooks/set-state-in-effect */
    setMode("limit");
    setTokenId(draft.tokenId);
    setSide(draft.side === "buy" ? Side.BUY : Side.SELL);
    setPrice(fmtPrice(draft.price));
    if (draft.size != null) setSize(Math.floor(draft.size).toString());
    setPending(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [draft, market, fmtPrice]);

  // Spendable balance (on-chain deposit-wallet USDC), refreshed when the wallet resolves.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBalance();
  }, [loadBalance]);

  // Remember the last size across reloads / market switches.
  useEffect(() => {
    try {
      localStorage.setItem("pm_last_size", size);
    } catch {
      /* storage unavailable */
    }
  }, [size]);

  // Keep the keyboard handler pointed at the latest actions/flags.
  useEffect(() => {
    kbdRef.current = { prepare, confirm, pending: !!pending, busy };
  });

  // Global keydown: b/s side, Enter submit (only from inside the ticket).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const inField = !!t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
      if (e.key === "Enter") {
        if (panelRef.current && t && panelRef.current.contains(t) && !kbdRef.current.busy) {
          e.preventDefault();
          if (kbdRef.current.pending) kbdRef.current.confirm();
          else kbdRef.current.prepare();
        }
        return;
      }
      if (inField || !panelRef.current) return;
      if (e.key === "b" || e.key === "B") setSide(Side.BUY);
      else if (e.key === "s" || e.key === "S") setSide(Side.SELL);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function enableTrading() {
    if (!wallet || !address) return;
    setEnabling(true);
    setMsg(null);
    try {
      const c = await deriveCreds(wallet);
      saveCreds(address, c); // cache so future reloads skip the signature
      await applyCreds(c);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn’t enable trading." });
    } finally {
      setEnabling(false);
    }
  }

  const slip = useMemo(() => {
    if (mode !== "market" || !book) return null;
    return expectedFill(book, side === Side.BUY ? "buy" : "sell", Number(size));
  }, [mode, book, side, size]);

  function prepare() {
    setMsg(null);
    if (!tokenId) return;
    const s = Number(size);
    if (!(s > 0)) return setMsg({ ok: false, text: "Size must be > 0." });

    if (mode === "limit") {
      const p = Number(price);
      if (!(p > 0 && p < 1)) return setMsg({ ok: false, text: "Price must be 0-1." });
      const expiration = gtd ? nowSec() + Number(expiryMin) * 60 : undefined;
      setPending({
        summary: [
          `${side} ${s} @ ${p} (${gtd ? `GTD ${expiryMin}m` : "GTC"})`,
          balance != null && side === Side.BUY ? `cost ≈ $${(p * s).toFixed(2)} · bal $${balance.toFixed(2)}` : "",
        ].filter(Boolean),
        legs: [
          {
            label: "limit",
            log: { side, price: p, size: s },
            orderType: gtd ? OrderType.GTD : OrderType.GTC,
            sign: (c) =>
              c.createOrder(
                { tokenID: tokenId, price: p, size: s, side, ...(expiration ? { expiration } : {}) },
                {},
              ),
          },
        ],
      });
    } else if (mode === "market") {
      setPending({
        summary: [
          `${side} ${s} ${side === Side.BUY ? "USDC" : "shares"} @ market`,
          slip ? `fill ≈ ${slip.avg.toFixed(3)} · slip ${slip.slippageBps.toFixed(0)} bps` : "thin book - check depth",
        ],
        legs: [
          {
            label: "market",
            log: { side, size: s },
            orderType: OrderType.FOK,
            sign: (c) => c.createMarketOrder({ tokenID: tokenId, amount: s, side }, {}),
          },
        ],
      });
    } else {
      // LP - two-sided quote around mid
      if (m == null) return setMsg({ ok: false, text: "No mid price - can’t quote." });
      const w = Number(spread);
      const bidP = roundTick(m - w / 2, tick);
      const askP = roundTick(m + w / 2, tick);
      if (!(bidP > 0 && askP < 1)) return setMsg({ ok: false, text: "Quote out of 0-1 range." });
      setPending({
        summary: [`buy ${s} @ ${bidP.toFixed(3)}`, `sell ${s} @ ${askP.toFixed(3)}`, `spread ${w} around ${m.toFixed(3)}`],
        legs: [
          {
            label: "lp-bid",
            log: { side: "BUY", price: bidP, size: s },
            orderType: OrderType.GTC,
            sign: (c) => c.createOrder({ tokenID: tokenId, price: bidP, size: s, side: Side.BUY }, {}),
          },
          {
            label: "lp-ask",
            log: { side: "SELL", price: askP, size: s },
            orderType: OrderType.GTC,
            sign: (c) => c.createOrder({ tokenID: tokenId, price: askP, size: s, side: Side.SELL }, {}),
          },
        ],
      });
    }
  }

  async function confirm() {
    if (!wallet || !creds || !pending || !market || !depositWallet) return;
    setBusy(true);
    setMsg(null);
    const c = clobClient(wallet, creds, depositWallet);
    // Sync CLOB's cached balance/allowance with on-chain before placing - avoids
    // the "balance: 0" rejection right after funding/approving.
    try {
      await refreshCollateral(wallet, creds, depositWallet);
    } catch {
      /* non-fatal: order will still attempt */
    }
    let ok = 0;
    for (const leg of pending.legs) {
      try {
        const signed = await leg.sign(c); // L1 sign once (wallet popup)
        const resp = (await withRetry(() =>
          c.postOrder(signed, leg.orderType),
        )) as { orderID?: string; status?: string };
        ok++;
        logTrade({
          ts: nowMs(),
          market: market.condition_id,
          side: leg.log.side,
          mode,
          price: leg.log.price,
          size: leg.log.size,
          status: resp?.status ?? "posted",
          order_id: resp?.orderID,
        });
        logActivity({
          ts: nowMs(),
          kind: "order",
          text: `${leg.log.side} ${leg.log.size}${leg.log.price ? ` @ ${leg.log.price}` : " @ mkt"} · ${market.question.slice(0, 32)}`,
          ok: true,
        });
      } catch (e) {
        logTrade({
          ts: nowMs(),
          market: market.condition_id,
          side: leg.log.side,
          mode,
          price: leg.log.price,
          size: leg.log.size,
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
        logActivity({
          ts: nowMs(),
          kind: "order",
          text: `${leg.log.side} ${leg.log.size} rejected`,
          ok: false,
          detail: e instanceof Error ? e.message.slice(0, 40) : "error",
        });
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Order rejected." });
      }
    }
    setPending(null);
    if (ok === pending.legs.length) setMsg({ ok: true, text: `Placed ${ok} order${ok > 1 ? "s" : ""}.` });
    await refreshOrders(creds);
    loadPositions();
    loadBalance();
    setBusy(false);
  }

  async function cancel(id: string) {
    if (!wallet || !creds || !depositWallet) return;
    try {
      await clobClient(wallet, creds, depositWallet).cancelOrder({ orderID: id });
      await refreshOrders(creds);
    } catch {
      /* list will show it persisted */
    }
  }
  async function cancelAll() {
    if (!wallet || !creds || !depositWallet) return;
    setBusy(true);
    try {
      await clobClient(wallet, creds, depositWallet).cancelAll();
      await refreshOrders(creds);
      setMsg({ ok: true, text: "Cancelled all open orders." });
      logActivity({ ts: nowMs(), kind: "cancel", text: "Cancelled all open orders", ok: true });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Cancel failed." });
    } finally {
      setBusy(false);
    }
  }

  // Cancel every order in the current market (also the LP both-sides cancel).
  async function cancelMarket() {
    if (!wallet || !creds || !market || !depositWallet) return;
    setBusy(true);
    try {
      await clobClient(wallet, creds, depositWallet).cancelMarketOrders({ market: market.condition_id });
      await refreshOrders(creds);
      setMsg({ ok: true, text: "Cancelled this market’s orders." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Cancel failed." });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(o: OpenOrder) {
    setEditingId(o.id);
    setEditPrice(o.price);
    setMsg(null);
  }

  // Re-price an open order = cancel + repost the remaining size at the new price.
  async function submitEdit(o: OpenOrder) {
    if (!wallet || !creds || !depositWallet) return;
    const p = Number(editPrice);
    if (!(p > 0 && p < 1)) return setMsg({ ok: false, text: "Price must be 0-1." });
    const remaining = Number(o.original_size) - Number(o.size_matched);
    if (!(remaining > 0)) return setMsg({ ok: false, text: "Nothing left to re-price." });
    setBusy(true);
    setMsg(null);
    const c = clobClient(wallet, creds, depositWallet);
    try {
      await c.cancelOrder({ orderID: o.id });
      const signed = await c.createOrder(
        { tokenID: o.asset_id, price: roundTick(p, tick), size: remaining, side: o.side as Side },
        {},
      );
      await withRetry(() => c.postOrder(signed, OrderType.GTC));
      setMsg({ ok: true, text: "Order re-priced." });
      logActivity({ ts: nowMs(), kind: "reprice", text: `Re-priced ${o.side} ${o.outcome} → ${roundTick(p, tick)}`, ok: true });
      setEditingId(null);
      await refreshOrders(creds);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Re-price failed (order may be cancelled)." });
      await refreshOrders(creds);
    } finally {
      setBusy(false);
    }
  }

  // --- quick-fill helpers ---
  const held = tokenId ? heldByToken[tokenId] ?? 0 : 0;

  function maxAvail(): number {
    if (mode === "market") {
      return side === Side.BUY ? balance ?? 0 : held; // buy=USDC, sell=shares
    }
    if (side === Side.BUY) {
      const p = Number(price);
      return p > 0 ? (balance ?? 0) / p : 0; // affordable shares at limit price
    }
    return held; // sell = shares held
  }

  function fillSize(ratio: number) {
    const v = maxAvail() * ratio;
    if (mode === "market" && side === Side.BUY) {
      setSize((Math.floor(v * 100) / 100).toString()); // USDC, 2dp
    } else {
      setSize(Math.floor(v).toString()); // whole shares
    }
    setPending(null);
  }

  function fillPrice(which: "bid" | "mid" | "ask") {
    const b = books[tokenId] ?? null;
    const v = which === "bid" ? bestBid(b) : which === "ask" ? bestAsk(b) : mid(b);
    if (v == null) return;
    setPrice(roundTick(v, tick).toFixed(tick < 0.01 ? 3 : 2));
    setPending(null);
  }

  async function topup() {
    if (!depositWallet) return;
    setTopupBusy(true);
    setMsg(null);
    try {
      await writeContractAsync(fundDepositWalletTx(depositWallet, topupAmt));
      setTopupOpen(false);
      setMsg({ ok: true, text: `Topped up $${topupAmt} - balance updates shortly.` });
      logActivity({ ts: nowMs(), kind: "fund", text: `Fund deposit wallet $${topupAmt}`, ok: true });
      setTimeout(loadBalance, 4000); // give the transfer a few seconds to mine
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Top up failed." });
    } finally {
      setTopupBusy(false);
    }
  }

  // --- gates ---
  if (!market) return null;
  if (!isConnected)
    return <p className="text-sm text-muted">Connect your wallet (top-right) to trade.</p>;
  if (!onPolygon)
    return (
      <button
        onClick={() => switchChain({ chainId: polygon.id })}
        className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90"
      >
        Switch to Polygon
      </button>
    );
  if (!creds)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">Sign once to derive your CLOB API key - no funds move.</p>
        <button
          onClick={enableTrading}
          disabled={enabling}
          className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
        >
          {enabling ? "Check your wallet…" : "Enable trading"}
        </button>
        {msg && <p className="text-sm text-neg">{msg.text}</p>}
      </div>
    );

  if (!walletReady)
    return (
      <DepositWalletOnboarding
        onReady={(walletAddress) => {
          setDepositWallet(walletAddress);
          setWalletReady(true);
        }}
      />
    );

  return (
    <div ref={panelRef} className="space-y-4">
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-1">
          {(["limit", "market", "lp"] as Mode[]).map((md) => (
            <button
              key={md}
              onClick={() => { setMode(md); setPending(null); }}
              className={`rounded-md px-2.5 py-1 uppercase tracking-wide ${
                mode === md ? "bg-elevated text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {md}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {balance != null && <span className="font-mono text-faint">${balance.toFixed(2)}</span>}
          <button
            onClick={() => setTopupOpen((o) => !o)}
            className={`rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${
              topupOpen ? "bg-elevated text-accent" : "text-faint hover:text-foreground"
            }`}
          >
            Top up
          </button>
          <button
            onClick={() => {
              if (address) clearCreds(address);
              setCreds(null);
              setOrders([]);
              setBalance(null);
            }}
            title="Re-derive CLOB key (sign again)"
            className="text-faint hover:text-foreground"
          >
            ↻
          </button>
        </div>
      </div>

      {topupOpen && (
        <div className="flex gap-2 rounded-md border border-border bg-elevated p-2">
          <input
            value={topupAmt}
            onChange={(e) => setTopupAmt(e.target.value)}
            inputMode="decimal"
            className={`${inputCls} font-mono`}
          />
          <button
            onClick={topup}
            disabled={topupBusy || !(Number(topupAmt) > 0)}
            className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50"
          >
            {topupBusy ? "Funding…" : `Fund wallet $${topupAmt}`}
          </button>
        </div>
      )}

      {/* outcome */}
      <div className="flex gap-2">
        {market.tokens.map((t) => (
          <button
            key={t.token_id}
            onClick={() => { setTokenId(t.token_id); setPending(null); }}
            className={`flex-1 rounded-md border px-2 py-1.5 text-sm ${
              tokenId === t.token_id ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground hover:border-accent"
            }`}
          >
            {t.outcome} <span className="font-mono text-xs text-muted">{t.price}</span>
          </button>
        ))}
      </div>

      {/* inputs per mode */}
      {mode !== "lp" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Side</label>
            <select className={inputCls} value={side} onChange={(e) => setSide(e.target.value as Side)}>
              <option value={Side.BUY}>Buy</option>
              <option value={Side.SELL}>Sell</option>
            </select>
          </div>
          <div>
            <label className={lbl}>{mode === "market" ? (side === Side.BUY ? "USDC" : "Shares") : "Size"}</label>
            <input className={`${inputCls} font-mono`} value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" />
          </div>
          {/* size quick-fill: buy = by balance, sell = by holdings */}
          <div className="col-span-2 flex items-center gap-1.5 text-[11px]">
            {[0.25, 0.5, 1].map((r) => (
              <button
                key={r}
                onClick={() => fillSize(r)}
                className="rounded bg-elevated px-2 py-0.5 font-mono text-muted hover:text-accent"
              >
                {r === 1 ? "Max" : `${r * 100}%`}
              </button>
            ))}
            {side === Side.SELL && (
              <span className="ml-auto font-mono text-faint">hold {held.toFixed(0)}</span>
            )}
          </div>
        </div>
      )}
      {mode === "limit" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Price</label>
            <input className={`${inputCls} font-mono`} value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
          </div>
          <div className="col-span-2 flex gap-1.5 text-[11px]">
            {(["bid", "mid", "ask"] as const).map((w) => (
              <button
                key={w}
                onClick={() => fillPrice(w)}
                className="rounded bg-elevated px-2 py-0.5 font-mono uppercase text-muted hover:text-accent"
              >
                {w}
              </button>
            ))}
          </div>
          <div>
            <label className={lbl}>Time in force</label>
            <select className={inputCls} value={gtd ? "GTD" : "GTC"} onChange={(e) => setGtd(e.target.value === "GTD")}>
              <option value="GTC">GTC</option>
              <option value="GTD">GTD (expiry)</option>
            </select>
          </div>
          {gtd && (
            <div>
              <label className={lbl}>Expires (min)</label>
              <input className={`${inputCls} font-mono`} value={expiryMin} onChange={(e) => setExpiryMin(e.target.value)} inputMode="numeric" />
            </div>
          )}
        </div>
      )}
      {mode === "market" && slip && (
        <p className="font-mono text-xs text-muted">
          fill ≈ {slip.avg.toFixed(3)} · slippage {slip.slippageBps.toFixed(0)} bps
        </p>
      )}
      {mode === "lp" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>Size (each side)</label>
            <input className={`${inputCls} font-mono`} value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label className={lbl}>Spread</label>
            <input className={`${inputCls} font-mono`} value={spread} onChange={(e) => setSpread(e.target.value)} inputMode="decimal" />
          </div>
          <p className="col-span-2 font-mono text-xs text-muted">
            {m != null ? `buy ${roundTick(m - Number(spread) / 2, tick).toFixed(3)} / sell ${roundTick(m + Number(spread) / 2, tick).toFixed(3)} around ${m.toFixed(3)}` : "no mid price"}
          </p>
        </div>
      )}

      {/* confirm step */}
      {pending ? (
        <div className="space-y-2 rounded-md border border-border bg-elevated p-3">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted">Review</div>
          {pending.summary.map((s, i) => (
            <div key={i} className="font-mono text-xs text-foreground">{s}</div>
          ))}
          <div className="flex gap-2 pt-1">
            <button onClick={confirm} disabled={busy} className="flex-1 rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90 disabled:opacity-50">
              {busy ? "Signing…" : "Confirm & sign"}
            </button>
            <button onClick={() => setPending(null)} disabled={busy} className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-foreground">
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <button onClick={prepare} className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-[var(--bg)] hover:opacity-90">
            {mode === "lp" ? "Quote both sides" : "Review order"}
          </button>
          <p className="text-center text-[10px] text-faint">
            <span className="font-mono">b</span>/<span className="font-mono">s</span> side · <span className="font-mono">Enter</span> submit
          </p>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-pos" : "text-neg"}`}>{msg.text}</p>}

      {/* open orders */}
      <div className="border-t border-hairline pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Open orders</span>
          {orders.length > 0 && (
            <span className="flex items-center gap-3">
              {orders.some((o) => o.market === market.condition_id) && (
                <button onClick={cancelMarket} disabled={busy} className="text-xs text-faint hover:text-neg">
                  Cancel market
                </button>
              )}
              <button onClick={cancelAll} disabled={busy} className="text-xs text-faint hover:text-neg">
                Cancel all
              </button>
            </span>
          )}
        </div>
        {orders.length === 0 ? (
          <p className="text-xs text-faint">No open orders.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {orders.map((o) => (
              <li key={o.id} className="py-1.5 font-mono text-xs">
                {editingId === o.id ? (
                  <div className="flex items-center gap-2">
                    <span className={o.side === "BUY" ? "text-pos" : "text-neg"}>
                      {o.side} {o.outcome}
                    </span>
                    <input
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      inputMode="decimal"
                      className="w-16 rounded border border-border bg-elevated px-1.5 py-0.5 text-foreground focus:border-accent focus:outline-none"
                    />
                    <button
                      onClick={() => submitEdit(o)}
                      disabled={busy}
                      className="text-accent hover:opacity-80 disabled:opacity-50"
                    >
                      save
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-faint hover:text-foreground">
                      cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className={o.side === "BUY" ? "text-pos" : "text-neg"}>
                      {o.side} {o.outcome} {o.price}×{(Number(o.original_size) - Number(o.size_matched)).toFixed(0)}
                    </span>
                    <span className="flex items-center gap-2">
                      <button onClick={() => startEdit(o)} title="Re-price" className="text-faint hover:text-accent">✎</button>
                      <button onClick={() => cancel(o.id)} title="Cancel" className="text-faint hover:text-neg">✕</button>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
