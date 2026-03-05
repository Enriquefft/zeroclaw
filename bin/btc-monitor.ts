#!/usr/bin/env bun
// bin/btc-monitor.ts — Bitcoin price monitor
// Fetches BTC/USD, tracks history, alerts on 5%+ drop in 1 hour.
// Output: JSON to stdout. Errors to stderr, exit 1.

import { $ } from "bun";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
const STATE_FILE = `${Bun.env.HOME}/.zeroclaw/workspace/btc-history.json`;
const ALERT_TO = "+51926689401";
const DROP_THRESHOLD = 5; // percent
const HISTORY_WINDOW = 60 * 60 * 1000; // 1 hour in ms
const PRUNE_AFTER = 24 * 60 * 60 * 1000; // 24 hours in ms
const ALERT_COOLDOWN = 60 * 60 * 1000; // 1 hour cooldown between alerts

interface PriceEntry {
  price: number;
  timestamp: number;
}

interface State {
  history: PriceEntry[];
  lastAlertAt: number | null;
}

function loadState(): State {
  try {
    const file = Bun.file(STATE_FILE);
    if (file.size === 0) throw new Error("empty");
    const data = JSON.parse(require("fs").readFileSync(STATE_FILE, "utf-8"));
    return {
      history: Array.isArray(data.history) ? data.history : [],
      lastAlertAt: data.lastAlertAt ?? null,
    };
  } catch {
    return { history: [], lastAlertAt: null };
  }
}

async function saveState(state: State): Promise<void> {
  await Bun.write(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchPrice(): Promise<number> {
  const res = await fetch(COINGECKO_URL);
  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);
  const data = (await res.json()) as { bitcoin?: { usd?: number } };
  const price = data?.bitcoin?.usd;
  if (typeof price !== "number") throw new Error("Invalid price data");
  return price;
}

async function sendAlert(message: string): Promise<void> {
  await $`kapso-whatsapp-cli send --to ${ALERT_TO} --text ${message}`.quiet();
}

try {
  const now = Date.now();
  const price = await fetchPrice();
  const state = loadState();

  // Prune entries older than 24h
  state.history = state.history.filter((e) => now - e.timestamp < PRUNE_AFTER);

  // Find oldest price within the 1-hour window
  const hourAgo = now - HISTORY_WINDOW;
  const recentEntries = state.history.filter((e) => e.timestamp >= hourAgo);
  const oldest =
    recentEntries.length > 0
      ? recentEntries.reduce((a, b) => (a.timestamp < b.timestamp ? a : b))
      : null;

  let changePct = 0;
  let alerted = false;

  if (oldest) {
    changePct = ((price - oldest.price) / oldest.price) * 100;

    const shouldAlert =
      changePct <= -DROP_THRESHOLD &&
      (state.lastAlertAt === null || now - state.lastAlertAt > ALERT_COOLDOWN);

    if (shouldAlert) {
      const msg = `BTC dropped ${Math.abs(changePct).toFixed(1)}% in the last hour. Current: $${price.toLocaleString()}, Was: $${oldest.price.toLocaleString()}`;
      try {
        await sendAlert(msg);
        state.lastAlertAt = now;
        alerted = true;
      } catch {
        console.error("Warning: WhatsApp alert delivery failed");
      }
    }
  }

  // Append current price
  state.history.push({ price, timestamp: now });
  await saveState(state);

  console.log(
    JSON.stringify({
      price,
      change_pct: Math.round(changePct * 100) / 100,
      alerted,
      history_size: state.history.length,
    })
  );
} catch (err) {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
}
