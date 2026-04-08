import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

// ─── Anthropic Client ───
const anthropic = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_key_here'
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ─── Market Data Store ───
const marketData = {
  binancePrice: null,
  chainlinkPrice: null,
  tickHistory: [],        // last 1200s of prices
  aggTrades: [],           // last 60s of trades
  buyVolume: 0,
  sellVolume: 0,
  klines: [],              // 1-min candles
  volumePerSecond: [],
};

// ─── 15-Minute Boundary Price Storage ───
// Captures Chainlink price at every :00, :15, :30, :45
const boundaryPrices = new Map(); // key = timestamp (ms), value = { timestamp, timeLabel, price, source }
const MS_5MIN = 15 * 60 * 1000;
let lastCapturedBoundary = 0;

function captureBoundaryPrice() {
  const now = Date.now();
  const currentBoundary = Math.floor(now / MS_5MIN) * MS_5MIN;

  // Only capture once per boundary, and within 3 seconds of the boundary
  if (currentBoundary === lastCapturedBoundary) return;
  if (now - currentBoundary > 3000) return;

  const price = marketData.chainlinkPrice || marketData.binancePrice;
  if (!price) return;

  const source = marketData.chainlinkPrice ? 'chainlink' : 'binance';
  const timeLabel = new Date(currentBoundary).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'America/New_York',
  });

  boundaryPrices.set(currentBoundary, {
    timestamp: currentBoundary,
    timeLabel,
    price,
    source,
    capturedAt: now,
  });

  lastCapturedBoundary = currentBoundary;

  // Keep last 200 entries (~16 hours)
  if (boundaryPrices.size > 200) {
    const oldest = Math.min(...boundaryPrices.keys());
    boundaryPrices.delete(oldest);
  }

  console.log(`[Boundary] Captured price at ${timeLabel} ET: $${price.toLocaleString()} (via ${source})`);
}

// Check every second for boundary crossings
setInterval(captureBoundaryPrice, 1000);

// On startup, capture the current boundary immediately (even if slightly late)
setTimeout(() => {
  const now = Date.now();
  const currentBoundary = Math.floor(now / MS_5MIN) * MS_5MIN;
  const price = marketData.chainlinkPrice || marketData.binancePrice;
  if (price && !boundaryPrices.has(currentBoundary)) {
    const timeLabel = new Date(currentBoundary).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZone: 'America/New_York',
    });
    boundaryPrices.set(currentBoundary, {
      timestamp: currentBoundary,
      timeLabel,
      price,
      source: marketData.chainlinkPrice ? 'chainlink' : 'binance',
      capturedAt: now,
    });
    lastCapturedBoundary = currentBoundary;
    console.log(`[Boundary] Startup capture at ${timeLabel} ET: $${price.toLocaleString()}`);
  }
}, 5000); // Wait 5s for WebSocket connections to establish

// ─── Polymarket WebSocket Connection ───
let polymarketWs = null;
let polymarketReconnectTimer = null;

function connectPolymarket() {
  if (polymarketWs && polymarketWs.readyState === WebSocket.OPEN) return;

  console.log('[Polymarket] Connecting to wss://ws-live-data.polymarket.com...');
  polymarketWs = new WebSocket('wss://ws-live-data.polymarket.com');

  polymarketWs.on('open', () => {
    console.log('[Polymarket] Connected');

    // Subscribe to Binance feed
    polymarketWs.send(JSON.stringify({
      action: 'subscribe',
      subscriptions: [{ topic: 'crypto_prices', type: 'update', filters: 'btcusdt' }]
    }));

    // Subscribe to Chainlink feed
    polymarketWs.send(JSON.stringify({
      action: 'subscribe',
      subscriptions: [{ topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"btc/usd"}' }]
    }));

    // Ping every 5 seconds
    const pingInterval = setInterval(() => {
      if (polymarketWs.readyState === WebSocket.OPEN) {
        polymarketWs.send('PING');
      } else {
        clearInterval(pingInterval);
      }
    }, 5000);
  });

  polymarketWs.on('message', (data) => {
    try {
      const msg = data.toString();
      if (msg === 'PONG') return;

      const parsed = JSON.parse(msg);

      // Extract price from multiple possible message formats
      let extractedPrice = null;
      // Path 1: parsed.payload.value
      if (parsed?.payload?.value !== undefined) extractedPrice = parseFloat(parsed.payload.value);
      // Path 2: parsed.data.price
      if ((extractedPrice === null || isNaN(extractedPrice)) && parsed?.data?.price !== undefined)
        extractedPrice = parseFloat(parsed.data.price);
      // Path 3: parsed.data.p
      if ((extractedPrice === null || isNaN(extractedPrice)) && parsed?.data?.p !== undefined)
        extractedPrice = parseFloat(parsed.data.p);
      // Path 4: parsed.data as number/string
      if ((extractedPrice === null || isNaN(extractedPrice)) && parsed?.data !== undefined) {
        const p = parseFloat(parsed.data);
        if (!isNaN(p) && p > 1000) extractedPrice = p;
      }
      // Path 5: parsed.payload as number/string
      if ((extractedPrice === null || isNaN(extractedPrice)) && parsed?.payload !== undefined) {
        const p = parseFloat(parsed.payload);
        if (!isNaN(p) && p > 1000) extractedPrice = p;
      }
      // Path 6: parsed.value
      if ((extractedPrice === null || isNaN(extractedPrice)) && parsed?.value !== undefined) {
        const p = parseFloat(parsed.value);
        if (!isNaN(p) && p > 1000) extractedPrice = p;
      }

      if (extractedPrice !== null && !isNaN(extractedPrice) && extractedPrice > 1000) {
        const topic = parsed.topic || parsed.channel || '';

        if (topic.includes('chainlink') || topic === 'crypto_prices_chainlink') {
          marketData.chainlinkPrice = extractedPrice;
        } else {
          marketData.binancePrice = extractedPrice;
          const now = Date.now();
          marketData.tickHistory.push({ time: now, price: extractedPrice });
          // Keep last 660 seconds
          const cutoff = now - 1200000;
          while (marketData.tickHistory.length > 0 && marketData.tickHistory[0].time < cutoff) {
            marketData.tickHistory.shift();
          }
        }
      }

      // Broadcast to connected clients
      broadcastToClients({
        type: 'polymarket',
        binancePrice: marketData.binancePrice,
        chainlinkPrice: marketData.chainlinkPrice,
      });
    } catch (e) {
      // Non-JSON message, ignore
    }
  });

  polymarketWs.on('close', () => {
    console.log('[Polymarket] Disconnected, reconnecting in 3s...');
    polymarketReconnectTimer = setTimeout(connectPolymarket, 3000);
  });

  polymarketWs.on('error', (err) => {
    console.error('[Polymarket] Error:', err.message);
    polymarketWs.close();
  });
}

// ─── Binance aggTrade WebSocket ───
let binanceWs = null;
const BINANCE_WS_URLS = [
  'wss://stream.binance.com:9443/ws/btcusdt@aggTrade',
  'wss://stream.binance.com:443/ws/btcusdt@aggTrade',
  'wss://fstream.binance.com/ws/btcusdt@aggTrade',
];
let binanceWsIndex = 0;

function connectBinanceAggTrade() {
  const url = BINANCE_WS_URLS[binanceWsIndex % BINANCE_WS_URLS.length];
  console.log(`[Binance] Connecting to aggTrade stream (${binanceWsIndex + 1}/${BINANCE_WS_URLS.length})...`);
  binanceWs = new WebSocket(url);

  binanceWs.on('open', () => {
    console.log('[Binance] aggTrade connected');
  });

  binanceWs.on('message', (data) => {
    try {
      const trade = JSON.parse(data.toString());
      const now = Date.now();
      const price = parseFloat(trade.p);
      const qty = parseFloat(trade.q);
      const isBuyerMaker = trade.m; // true = sell, false = buy

      if (!isNaN(price) && price > 0) {
        // Update binance price from aggTrade if polymarket hasn't provided one
        if (!marketData.binancePrice) {
          marketData.binancePrice = price;
        }

        // Store tick
        marketData.tickHistory.push({ time: now, price });
        const cutoff = now - 1200000;
        while (marketData.tickHistory.length > 0 && marketData.tickHistory[0].time < cutoff) {
          marketData.tickHistory.shift();
        }
      }

      // Track buy/sell
      const tradeEntry = { time: now, price, qty, isBuy: !isBuyerMaker };
      marketData.aggTrades.push(tradeEntry);

      // Keep last 60 seconds
      const tradeCutoff = now - 60000;
      while (marketData.aggTrades.length > 0 && marketData.aggTrades[0].time < tradeCutoff) {
        marketData.aggTrades.shift();
      }

      // Recalculate buy/sell volumes
      marketData.buyVolume = 0;
      marketData.sellVolume = 0;
      for (const t of marketData.aggTrades) {
        if (t.isBuy) marketData.buyVolume += t.qty;
        else marketData.sellVolume += t.qty;
      }

      // Volume per second tracking
      const secKey = Math.floor(now / 1000);
      const lastEntry = marketData.volumePerSecond[marketData.volumePerSecond.length - 1];
      if (lastEntry && lastEntry.sec === secKey) {
        lastEntry.vol += qty;
      } else {
        marketData.volumePerSecond.push({ sec: secKey, vol: qty });
        if (marketData.volumePerSecond.length > 300) {
          marketData.volumePerSecond.shift();
        }
      }

      // Broadcast trade data
      broadcastToClients({
        type: 'trade',
        price,
        qty,
        isBuy: !isBuyerMaker,
        buyVolume: marketData.buyVolume,
        sellVolume: marketData.sellVolume,
        binancePrice: marketData.binancePrice,
      });
    } catch (e) {
      // ignore
    }
  });

  binanceWs.on('close', () => {
    binanceWsIndex++;
    console.log('[Binance] aggTrade disconnected, trying next endpoint in 3s...');
    setTimeout(connectBinanceAggTrade, 3000);
  });

  binanceWs.on('error', (err) => {
    console.error('[Binance] aggTrade error:', err.message);
    try { binanceWs.close(); } catch(e) {}
  });
}

// ─── Fetch Klines periodically ───
const KLINE_URLS = [
  'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=120',
  'https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=120',
  'https://api1.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=120',
];

async function fetchKlines() {
  for (const url of KLINE_URLS) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      marketData.klines = data.map(k => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: k[6],
      }));
      return;
    } catch (e) {
      continue;
    }
  }
  // If all Binance endpoints fail, build klines from tick history
  if (marketData.klines.length === 0 && marketData.tickHistory.length > 0) {
    buildKlinesFromTicks();
  }
}

function buildKlinesFromTicks() {
  const ticks = marketData.tickHistory;
  if (ticks.length < 2) return;
  const klines = [];
  const interval = 60000; // 1 minute
  const start = Math.floor(ticks[0].time / interval) * interval;
  const end = ticks[ticks.length - 1].time;

  for (let t = start; t < end; t += interval) {
    const bucket = ticks.filter(tick => tick.time >= t && tick.time < t + interval);
    if (bucket.length === 0) continue;
    const prices = bucket.map(b => b.price);
    klines.push({
      openTime: t,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      volume: bucket.length,
      closeTime: t + interval,
    });
  }
  if (klines.length > 0) marketData.klines = klines;
}

// Fetch every 10 seconds
setInterval(fetchKlines, 10000);
fetchKlines();

// ─── Technical Analysis Calculations ───
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(closes) {
  if (closes.length < 26) return null;
  const ema = (data, period) => {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  };

  const ema12Vals = [];
  const ema26Vals = [];
  let ema12 = closes[0], ema26 = closes[0];
  const k12 = 2 / 13, k26 = 2 / 27;

  for (let i = 1; i < closes.length; i++) {
    ema12 = closes[i] * k12 + ema12 * (1 - k12);
    ema26 = closes[i] * k26 + ema26 * (1 - k26);
    if (i >= 25) {
      ema12Vals.push(ema12);
      ema26Vals.push(ema26);
    }
  }

  const macdLine = ema12 - ema26;
  const macdHistory = ema12Vals.map((v, i) => v - ema26Vals[i]);
  const signal = ema(macdHistory.slice(-9), 9);
  const histogram = macdLine - signal;

  return { macd: macdLine, signal, histogram, history: macdHistory.slice(-20) };
}

function calculateBollingerBands(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: sma + 2 * stdDev,
    middle: sma,
    lower: sma - 2 * stdDev,
    bandwidth: (4 * stdDev) / sma * 100,
  };
}

function calculateSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateMomentum(closes) {
  const roc = (n) => {
    if (closes.length < n + 1) return null;
    const current = closes[closes.length - 1];
    const past = closes[closes.length - 1 - n];
    return ((current - past) / past) * 100;
  };
  return {
    m1: roc(1),
    m3: roc(3),
    m5: roc(5),
    m10: roc(10),
    m15: roc(15),
  };
}

function detectCandlestickPatterns(candles) {
  if (candles.length < 5) return [];
  const last5 = candles.slice(-5);
  const patterns = [];

  // 3 green/red in a row
  const lastThree = last5.slice(-3);
  if (lastThree.every(c => c.close > c.open)) patterns.push({ name: 'Three Green Soldiers', signal: 'bullish' });
  if (lastThree.every(c => c.close < c.open)) patterns.push({ name: 'Three Red Crows', signal: 'bearish' });

  // Doji (last candle)
  const last = last5[last5.length - 1];
  const bodySize = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  if (range > 0 && bodySize / range < 0.1) patterns.push({ name: 'Doji', signal: 'neutral' });

  // Engulfing
  if (last5.length >= 2) {
    const prev = last5[last5.length - 2];
    const curr = last;
    if (prev.close < prev.open && curr.close > curr.open &&
        curr.open <= prev.close && curr.close >= prev.open) {
      patterns.push({ name: 'Bullish Engulfing', signal: 'bullish' });
    }
    if (prev.close > prev.open && curr.close < curr.open &&
        curr.open >= prev.close && curr.close <= prev.open) {
      patterns.push({ name: 'Bearish Engulfing', signal: 'bearish' });
    }
  }

  // Long wick rejection
  if (range > 0) {
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;
    if (upperWick / range > 0.6) patterns.push({ name: 'Upper Wick Rejection', signal: 'bearish' });
    if (lowerWick / range > 0.6) patterns.push({ name: 'Lower Wick Rejection', signal: 'bullish' });
  }

  return patterns;
}

function findSupportResistance(candles) {
  if (candles.length < 10) return { support: [], resistance: [] };

  const levels = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    // Local high
    if (c.high > candles[i-1].high && c.high > candles[i-2].high &&
        c.high > candles[i+1].high && c.high > candles[i+2].high) {
      levels.push({ price: c.high, type: 'resistance' });
    }
    // Local low
    if (c.low < candles[i-1].low && c.low < candles[i-2].low &&
        c.low < candles[i+1].low && c.low < candles[i+2].low) {
      levels.push({ price: c.low, type: 'support' });
    }
  }

  // Cluster nearby levels
  const cluster = (lvls) => {
    const sorted = [...lvls].sort((a, b) => a.price - b.price);
    const clustered = [];
    for (const l of sorted) {
      const last = clustered[clustered.length - 1];
      if (last && Math.abs(l.price - last.price) / last.price < 0.001) {
        last.strength++;
        last.price = (last.price + l.price) / 2;
      } else {
        clustered.push({ ...l, strength: 1 });
      }
    }
    return clustered.sort((a, b) => b.strength - a.strength).slice(0, 5);
  };

  return {
    support: cluster(levels.filter(l => l.type === 'support')),
    resistance: cluster(levels.filter(l => l.type === 'resistance')),
  };
}

function detectTrend(ticks) {
  if (ticks.length < 10) return { direction: 'flat', acceleration: 0 };

  // Split into segments
  const segments = [];
  const segSize = Math.max(1, Math.floor(ticks.length / 5));
  for (let i = 0; i < ticks.length; i += segSize) {
    const seg = ticks.slice(i, i + segSize);
    if (seg.length > 0) {
      const high = Math.max(...seg.map(t => t.price));
      const low = Math.min(...seg.map(t => t.price));
      segments.push({ high, low, avg: seg.reduce((a, b) => a + b.price, 0) / seg.length });
    }
  }

  let higherHighs = 0, lowerLows = 0;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].high > segments[i-1].high) higherHighs++;
    if (segments[i].low < segments[i-1].low) lowerLows++;
  }

  const first = segments[0]?.avg || 0;
  const last = segments[segments.length - 1]?.avg || 0;
  const mid = segments[Math.floor(segments.length / 2)]?.avg || 0;

  const overallSlope = first > 0 ? (last - first) / first * 100 : 0;
  const earlySlope = first > 0 ? (mid - first) / first * 100 : 0;
  const lateSlope = mid > 0 ? (last - mid) / mid * 100 : 0;
  const acceleration = lateSlope - earlySlope;

  let direction = 'flat';
  if (higherHighs >= 3 && overallSlope > 0.01) direction = 'up';
  else if (lowerLows >= 3 && overallSlope < -0.01) direction = 'down';
  else if (overallSlope > 0.02) direction = 'up';
  else if (overallSlope < -0.02) direction = 'down';

  return { direction, acceleration, slope: overallSlope };
}

function getVolumeStatus() {
  const vps = marketData.volumePerSecond;
  if (vps.length < 10) return { status: 'NORMAL', ratio: 1 };

  const recent = vps.slice(-10);
  const older = vps.slice(-60, -10);

  const recentAvg = recent.reduce((a, b) => a + b.vol, 0) / recent.length;
  const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b.vol, 0) / older.length : recentAvg;

  const ratio = olderAvg > 0 ? recentAvg / olderAvg : 1;

  let status = 'NORMAL';
  if (ratio < 0.5) status = 'LOW';
  else if (ratio > 3) status = 'SPIKE';
  else if (ratio > 2) status = 'HIGH';

  return { status, ratio };
}

// ─── Prediction Engine v5: 10-Signal Scoring + Confidence Tiers ───

// ── Helper Functions ──

function computeTypicalRange(closes) {
  if (closes.length < 6) return 50;
  const returns1m = [];
  for (let i = 1; i < closes.length; i++) returns1m.push(closes[i] - closes[i - 1]);
  const std1m = Math.sqrt(returns1m.reduce((s, r) => s + r * r, 0) / returns1m.length);
  return std1m * Math.sqrt(15); // scale 1-min std to 15-min
}

function computeWeightedVelocity(ticks, windowMs) {
  if (ticks.length < 3) return 0;
  const cutoff = Date.now() - windowMs;
  const recent = ticks.filter(t => t.time >= cutoff);
  if (recent.length < 2) return 0;
  let weightedSum = 0, weightTotal = 0;
  for (let i = 1; i < recent.length; i++) {
    const dt = (recent[i].time - recent[i - 1].time) / 1000;
    if (dt <= 0) continue;
    const velocity = (recent[i].price - recent[i - 1].price) / dt;
    const age = (Date.now() - recent[i].time) / 1000;
    const weight = Math.exp(-age / (windowMs / 2000));
    weightedSum += velocity * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

function computeEMA(series, period) {
  if (series.length === 0) return [];
  const k = 2 / (period + 1);
  const vals = [series[0]];
  for (let i = 1; i < series.length; i++) {
    vals.push(series[i] * k + vals[i - 1] * (1 - k));
  }
  return vals;
}

function countDirectionChanges(ticks, windowMs) {
  const cutoff = Date.now() - windowMs;
  const recent = ticks.filter(t => t.time >= cutoff);
  if (recent.length < 3) return 0;
  let changes = 0;
  for (let i = 2; i < recent.length; i++) {
    const prev = recent[i - 1].price - recent[i - 2].price;
    const curr = recent[i].price - recent[i - 1].price;
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) changes++;
  }
  return changes;
}

// ── 10 Signal Functions ──
// Each returns { direction: 'OVER'|'UNDER'|'NEUTRAL', detail: string }

function signalVelocity(ticks) {
  const vel = computeWeightedVelocity(ticks, 180000);
  if (vel > 0.5) return { direction: 'OVER', detail: `Velocity +${vel.toFixed(2)} $/s (bullish momentum)` };
  if (vel < -0.5) return { direction: 'UNDER', detail: `Velocity ${vel.toFixed(2)} $/s (bearish momentum)` };
  return { direction: 'NEUTRAL', detail: `Velocity ${vel.toFixed(2)} $/s (flat)` };
}

function signalAcceleration(ticks) {
  const recent = computeWeightedVelocity(ticks, 90000);
  const earlier = computeWeightedVelocity(ticks, 180000);
  const accel = recent - earlier;
  if (accel > 0.3) return { direction: 'OVER', detail: `Accelerating up (${accel.toFixed(2)})` };
  if (accel < -0.3) return { direction: 'UNDER', detail: `Accelerating down (${accel.toFixed(2)})` };
  return { direction: 'NEUTRAL', detail: `Flat acceleration (${accel.toFixed(2)})` };
}

function signalOrderFlow(buyVol, sellVol) {
  const total = buyVol + sellVol;
  if (total <= 0) return { direction: 'NEUTRAL', detail: 'No volume data' };
  const buyPct = (buyVol / total) * 100;
  if (buyPct > 60) return { direction: 'OVER', detail: `Buy dominance ${buyPct.toFixed(0)}%` };
  if (buyPct < 40) return { direction: 'UNDER', detail: `Sell dominance ${(100 - buyPct).toFixed(0)}%` };
  return { direction: 'NEUTRAL', detail: `Balanced flow ${buyPct.toFixed(0)}% buy` };
}

function signalVolumeTrend(volStatus, velocityDir) {
  if (volStatus === 'SPIKE' || volStatus === 'HIGH') {
    if (velocityDir === 'OVER') return { direction: 'OVER', detail: `${volStatus} volume confirms upward move` };
    if (velocityDir === 'UNDER') return { direction: 'UNDER', detail: `${volStatus} volume confirms downward move` };
    return { direction: 'NEUTRAL', detail: `${volStatus} volume but no clear direction` };
  }
  return { direction: 'NEUTRAL', detail: `Volume ${volStatus} — no trend confirmation` };
}

function signalLastCandles(klines) {
  const last3 = klines.slice(-3);
  if (last3.length < 3) return { direction: 'NEUTRAL', detail: 'Insufficient candle data' };
  let green = 0, red = 0;
  for (const k of last3) {
    if (k.close > k.open) green++;
    else if (k.close < k.open) red++;
  }
  if (green >= 2) return { direction: 'OVER', detail: `${green}/3 green candles` };
  if (red >= 2) return { direction: 'UNDER', detail: `${red}/3 red candles` };
  return { direction: 'NEUTRAL', detail: 'Mixed candles' };
}

function signalRSI(closes, velocityDir) {
  const rsi = calculateRSI(closes);
  if (rsi === null) return { direction: 'NEUTRAL', detail: 'RSI unavailable' };
  if (rsi < 30 && velocityDir !== 'UNDER') return { direction: 'OVER', detail: `RSI oversold ${rsi.toFixed(1)} — bounce likely` };
  if (rsi > 70 && velocityDir !== 'OVER') return { direction: 'UNDER', detail: `RSI overbought ${rsi.toFixed(1)} — pullback likely` };
  if (rsi < 45) return { direction: 'OVER', detail: `RSI low ${rsi.toFixed(1)} — room to rise` };
  if (rsi > 55) return { direction: 'UNDER', detail: `RSI high ${rsi.toFixed(1)} — room to fall` };
  return { direction: 'NEUTRAL', detail: `RSI neutral ${rsi.toFixed(1)}` };
}

function signalMACD(closes) {
  const macd = calculateMACD(closes);
  if (!macd) return { direction: 'NEUTRAL', detail: 'MACD unavailable' };
  const hist = macd.histogram;
  const prevHist = macd.history && macd.history.length >= 2 ? macd.history[macd.history.length - 2] : hist;
  const growing = Math.abs(hist) > Math.abs(prevHist);
  if (hist > 0 && growing) return { direction: 'OVER', detail: `MACD +${hist.toFixed(2)} and growing` };
  if (hist > 0) return { direction: 'OVER', detail: `MACD +${hist.toFixed(2)} but fading` };
  if (hist < 0 && growing) return { direction: 'UNDER', detail: `MACD ${hist.toFixed(2)} and growing` };
  if (hist < 0) return { direction: 'UNDER', detail: `MACD ${hist.toFixed(2)} but fading` };
  return { direction: 'NEUTRAL', detail: `MACD flat ${hist.toFixed(2)}` };
}

function signalBollinger(closes, velocityDir) {
  const bb = calculateBollingerBands(closes);
  if (!bb) return { direction: 'NEUTRAL', detail: 'Bollinger unavailable' };
  const price = closes[closes.length - 1];
  const position = (price - bb.lower) / (bb.upper - bb.lower);
  if (position > 0.9 && velocityDir !== 'OVER') return { direction: 'UNDER', detail: `Near upper band (${(position * 100).toFixed(0)}%) — mean reversion` };
  if (position < 0.1 && velocityDir !== 'UNDER') return { direction: 'OVER', detail: `Near lower band (${(position * 100).toFixed(0)}%) — mean reversion` };
  if (position > 0.6) return { direction: 'OVER', detail: `Upper half of bands (${(position * 100).toFixed(0)}%) — trending up` };
  if (position < 0.4) return { direction: 'UNDER', detail: `Lower half of bands (${(position * 100).toFixed(0)}%) — trending down` };
  return { direction: 'NEUTRAL', detail: `Mid-band (${(position * 100).toFixed(0)}%)` };
}

function signalEMAIndicator(closes, ticks) {
  let series = [];
  if (ticks.length >= 30) {
    series = ticks.slice(-900).map(t => t.price);
  } else {
    series = closes.slice(-30);
  }
  if (series.length < 15) return { direction: 'NEUTRAL', detail: 'Insufficient EMA data' };
  const ema10 = computeEMA(series, 10);
  const ema30 = computeEMA(series, Math.min(30, Math.floor(series.length * 0.8)));
  const lastEma10 = ema10[ema10.length - 1];
  const lastEma30 = ema30[ema30.length - 1];
  const gap = lastEma10 - lastEma30;
  const prevEma10 = ema10.length > 5 ? ema10[ema10.length - 6] : lastEma10;
  const prevEma30 = ema30.length > 5 ? ema30[ema30.length - 6] : lastEma30;
  const gapChange = gap - (prevEma10 - prevEma30);
  if (gap > 0 && gapChange > 0) return { direction: 'OVER', detail: `EMA10 > EMA30 (+$${gap.toFixed(2)}), gap widening` };
  if (gap > 0) return { direction: 'OVER', detail: `EMA10 > EMA30 (+$${gap.toFixed(2)}), gap narrowing` };
  if (gap < 0 && gapChange < 0) return { direction: 'UNDER', detail: `EMA10 < EMA30 ($${gap.toFixed(2)}), gap widening` };
  if (gap < 0) return { direction: 'UNDER', detail: `EMA10 < EMA30 ($${gap.toFixed(2)}), gap narrowing` };
  return { direction: 'NEUTRAL', detail: 'EMAs converged' };
}

function signalStrikeDistance(currentPrice, strike, typicalRange) {
  const dist = currentPrice - strike;
  const ratio = typicalRange > 0 ? dist / typicalRange : 0;
  if (ratio > 0.5) return { direction: 'OVER', detail: `Price $${dist.toFixed(2)} above strike (${(ratio * 100).toFixed(0)}% of range)` };
  if (ratio < -0.5) return { direction: 'UNDER', detail: `Price $${Math.abs(dist).toFixed(2)} below strike (${(Math.abs(ratio) * 100).toFixed(0)}% of range)` };
  return { direction: 'NEUTRAL', detail: `Price near strike ($${dist.toFixed(2)}, ${(Math.abs(ratio) * 100).toFixed(0)}% of range)` };
}

// ── Scoring + Disqualifiers ──

function mapSignalsToConfidence(overCount, underCount) {
  const dominant = Math.max(overCount, underCount);
  const lookup = { 10: 80, 9: 75, 8: 70, 7: 67, 6: 62, 5: 57, 4: 52 };
  return lookup[dominant] || 50;
}

function applyDisqualifiers(confidence, direction, context) {
  const disqualifiers = [];
  let capped = confidence;

  if (context.volumeStatus === 'LOW') {
    capped = Math.min(capped, 60);
    disqualifiers.push('Low volume — capped at 60%');
  }
  if (context.directionChanges > 15) {
    capped = Math.min(capped, 58);
    disqualifiers.push(`Choppy price (${context.directionChanges} reversals) — capped at 58%`);
  }
  const rsi = context.rsi;
  if (rsi !== null) {
    if ((direction === 'OVER' && rsi > 75) || (direction === 'UNDER' && rsi < 25)) {
      capped = Math.min(capped, 55);
      disqualifiers.push(`RSI extreme (${rsi.toFixed(1)}) against call — capped at 55%`);
    }
  }
  if (context.minutesRemaining < 1) {
    capped = Math.min(capped, 60);
    disqualifiers.push(`<1 min remaining — capped at 60%`);
  }
  if (context.typicalRange > 0) {
    const distRatio = Math.abs(context.currentPrice - context.strikePrice) / context.typicalRange;
    if (distRatio > 3) {
      capped = Math.min(capped, 55);
      disqualifiers.push(`Strike too far (${distRatio.toFixed(1)}x range) — capped at 55%`);
    }
  }

  return { confidence: capped, disqualifiers };
}

// ── Claude AI Confirmation (GREEN tier only) ──

async function callClaudeForConfirmation(direction, confidence, signalsList, snapshot) {
  if (!anthropic) return null;
  try {
    const signalSummary = signalsList.map(s =>
      `${s.name}: ${s.direction} — ${s.detail}`
    ).join('\n');
    const prompt = `You are a BTC short-term trading analyst. A scoring system produced a ${direction} call at ${confidence}% confidence for a 15-minute window.

Current price: $${snapshot.currentPrice.toLocaleString()}
Strike price: $${snapshot.strikePrice.toLocaleString()}
Minutes remaining: ${snapshot.minutesRemaining.toFixed(1)}

Signal breakdown:
${signalSummary}

Based on the signals, do you CONFIRM or DOWNGRADE this call? Reply ONLY with valid JSON:
{"verdict": "CONFIRM" or "DOWNGRADE", "adjustedConfidence": number (50-80), "reason": "one sentence"}`;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return null;
  } catch (e) {
    console.error('[AI Confirmation] Error:', e.message);
    return null;
  }
}

// ──────────────────────────────────────────────────
// PREDICTION ENGINE: 10-Signal Scoring
// ──────────────────────────────────────────────────
async function runPrediction(strikePrice, windowEndMs, opts = {}) {
  const klines = marketData.klines;
  const closes = klines.map(k => k.close);
  const ticks = marketData.tickHistory;
  const currentPrice = marketData.chainlinkPrice || marketData.binancePrice ||
    (ticks.length > 0 ? ticks[ticks.length - 1].price : null) ||
    (closes.length > 0 ? closes[closes.length - 1] : null);
  if (!currentPrice) return null;

  const now = Date.now();
  const minutesRemaining = windowEndMs ? Math.max(0.1, (windowEndMs - now) / 60000) : 15;
  const typicalRange = computeTypicalRange(closes);
  const volStatus = getVolumeStatus();
  const velocityDir = signalVelocity(ticks).direction;

  // ── Run all 10 signals ──
  const signalsList = [
    { name: 'Velocity', ...signalVelocity(ticks) },
    { name: 'Acceleration', ...signalAcceleration(ticks) },
    { name: 'Order Flow', ...signalOrderFlow(marketData.buyVolume, marketData.sellVolume) },
    { name: 'Volume Trend', ...signalVolumeTrend(volStatus.status, velocityDir) },
    { name: 'Last Candles', ...signalLastCandles(klines) },
    { name: 'RSI', ...signalRSI(closes, velocityDir) },
    { name: 'MACD', ...signalMACD(closes) },
    { name: 'Bollinger', ...signalBollinger(closes, velocityDir) },
    { name: 'EMA Cross', ...signalEMAIndicator(closes, ticks) },
    { name: 'Strike Dist', ...signalStrikeDistance(currentPrice, strikePrice, typicalRange) },
  ];

  const overCount = signalsList.filter(s => s.direction === 'OVER').length;
  const underCount = signalsList.filter(s => s.direction === 'UNDER').length;
  const neutralCount = signalsList.filter(s => s.direction === 'NEUTRAL').length;

  const direction = overCount > underCount ? 'OVER' : underCount > overCount ? 'UNDER' : 'NEUTRAL';
  let confidence = mapSignalsToConfidence(overCount, underCount);

  // ── Apply disqualifiers ──
  const dirChanges = countDirectionChanges(ticks, 120000);
  const rsi = calculateRSI(closes);
  const disqResult = applyDisqualifiers(confidence, direction, {
    volumeStatus: volStatus.status,
    directionChanges: dirChanges,
    rsi,
    minutesRemaining,
    typicalRange,
    currentPrice,
    strikePrice,
  });
  confidence = disqResult.confidence;
  const disqualifiers = disqResult.disqualifiers;

  // ── Assign tier ──
  let tier, tierLabel;
  if (confidence >= 65) { tier = 'GREEN'; tierLabel = 'TRADE'; }
  else if (confidence >= 55) { tier = 'YELLOW'; tierLabel = 'SKIP'; }
  else { tier = 'RED'; tierLabel = 'NO EDGE'; }

  // ── Claude AI confirmation (GREEN only) ──
  let aiConfirmation = null;
  if (tier === 'GREEN' && !opts.skipAI) {
    aiConfirmation = await callClaudeForConfirmation(direction, confidence, signalsList, {
      currentPrice, strikePrice, minutesRemaining,
    });
    if (aiConfirmation && aiConfirmation.adjustedConfidence < 65) {
      confidence = aiConfirmation.adjustedConfidence;
      tier = confidence >= 55 ? 'YELLOW' : 'RED';
      tierLabel = tier === 'YELLOW' ? 'SKIP' : 'NO EDGE';
    }
  }

  // ── Projected price (simple velocity-based) ──
  const vel = computeWeightedVelocity(ticks, 180000);
  const projectedPrice = Math.round((currentPrice + vel * minutesRemaining * 60) * 100) / 100;

  // ── Momentum context for display ──
  const totalVol = marketData.buyVolume + marketData.sellVolume;
  const buyRatio = totalVol > 0 ? Math.round((marketData.buyVolume / totalVol) * 100) : 50;
  const macd = calculateMACD(closes);
  const last5 = klines.slice(-5);
  let consecutiveGreen = 0, consecutiveRed = 0;
  for (let i = last5.length - 1; i >= 0; i--) {
    if (last5[i].close > last5[i].open) { if (consecutiveRed === 0) consecutiveGreen++; else break; }
    else if (last5[i].close < last5[i].open) { if (consecutiveGreen === 0) consecutiveRed++; else break; }
    else break;
  }

  const overProbability = direction === 'OVER' ? confidence : direction === 'UNDER' ? (100 - confidence) : 50;
  const underProbability = 100 - overProbability;

  return {
    direction,
    confidence,
    tier,
    tierLabel,
    signals: {
      total: 10,
      overCount,
      underCount,
      neutralCount,
      list: signalsList,
    },
    disqualifiers,
    projectedPrice,
    overProbability,
    underProbability,
    aiConfirmation,
    momentum: {
      buyRatio,
      volumeStatus: volStatus.status,
      consecutiveGreen,
      consecutiveRed,
      rsi: rsi !== null ? Math.round(rsi * 10) / 10 : null,
      macdHistogram: macd ? Math.round(macd.histogram * 100) / 100 : null,
    },
    snapshot: {
      currentPrice,
      strikePrice,
      timestamp: now,
    },
    minutesRemaining: Math.round(minutesRemaining * 100) / 100,
  };
}

// ──────────────────────────────────────────────────
// BACKTESTING ENGINE
// ──────────────────────────────────────────────────
let backtestResult = null;

async function runBacktest() {
  const klines = marketData.klines;
  if (klines.length < 50) { backtestResult = null; return; }
  const closes = klines.map(k => k.close);

  let correct = 0, total = 0;
  const results = [];

  // Test every 5th candle as a potential window start
  for (let i = 30; i < closes.length - 15; i += 5) {
    const price = closes[i];
    // Simulate a strike at the current price (most common Polymarket setup)
    const strike = price;
    const minutesRem = 15;

    // Build "ticks" from candle closes up to point i
    const fakeTicks = closes.slice(0, i + 1).map((c, idx) => ({ time: Date.now() - (i - idx) * 60000, price: c }));
    const oldTicks = marketData.tickHistory;
    const oldKlines = marketData.klines;

    // Temporarily swap data
    marketData.tickHistory = fakeTicks;
    marketData.klines = klines.slice(0, i + 1);

    const pred = await runPrediction(strike, Date.now() + minutesRem * 60000, { skipAI: true });
    // Restore
    marketData.tickHistory = oldTicks;
    marketData.klines = oldKlines;

    if (!pred) continue;

    const actualPrice = closes[Math.min(i + 15, closes.length - 1)];
    const actualOver = actualPrice > strike;
    const predictedOver = pred.direction === 'OVER' || (pred.direction === 'NEUTRAL' && pred.overProbability > 50);
    const isCorrect = actualOver === predictedOver;
    if (isCorrect) correct++;
    total++;

    results.push({
      index: i,
      strike: Math.round(strike * 100) / 100,
      predicted: pred.direction,
      confidence: pred.confidence,
      actual: actualOver ? 'OVER' : 'UNDER',
      correct: isCorrect,
    });
  }

  backtestResult = {
    correct,
    total,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
    lastRun: Date.now(),
    results: results.slice(-20), // keep last 20 for display
  };
  console.log(`[Backtest] ${correct}/${total} correct (${backtestResult.accuracy}%) over ${klines.length} candles`);
}

// Run backtest after initial data load, then every 15 minutes
setTimeout(() => runBacktest(), 15000);
setInterval(() => runBacktest(), 15 * 60 * 1000);

// ─── API Routes ───

// Market data snapshot
app.get('/api/market-data', (req, res) => {
  const closes = marketData.klines.map(k => k.close);
  const rsi = calculateRSI(closes);
  const macd = calculateMACD(closes);
  const bb = calculateBollingerBands(closes);
  const sma20 = calculateSMA(closes, 20);
  const sma50 = calculateSMA(closes, 50);
  const momentum = calculateMomentum(closes);
  const patterns = detectCandlestickPatterns(marketData.klines);
  const sr = findSupportResistance(marketData.klines);
  const trend = detectTrend(marketData.tickHistory);
  const volStatus = getVolumeStatus();
  const totalVol = marketData.buyVolume + marketData.sellVolume;

  res.json({
    binancePrice: marketData.binancePrice,
    chainlinkPrice: marketData.chainlinkPrice,
    indicators: {
      rsi: rsi ? Math.round(rsi * 10) / 10 : null,
      macd: macd ? {
        macd: Math.round(macd.macd * 100) / 100,
        signal: Math.round(macd.signal * 100) / 100,
        histogram: Math.round(macd.histogram * 100) / 100,
        history: macd.history.map(h => Math.round(h * 100) / 100),
      } : null,
      bollingerBands: bb ? {
        upper: Math.round(bb.upper * 100) / 100,
        middle: Math.round(bb.middle * 100) / 100,
        lower: Math.round(bb.lower * 100) / 100,
        bandwidth: Math.round(bb.bandwidth * 100) / 100,
      } : null,
      sma20: sma20 ? Math.round(sma20 * 100) / 100 : null,
      sma50: sma50 ? Math.round(sma50 * 100) / 100 : null,
      momentum,
    },
    patterns,
    supportResistance: sr,
    trend,
    volume: {
      status: volStatus.status,
      ratio: Math.round(volStatus.ratio * 100) / 100,
      buyVolume: Math.round(marketData.buyVolume * 1000) / 1000,
      sellVolume: Math.round(marketData.sellVolume * 1000) / 1000,
      buyRatio: totalVol > 0 ? Math.round((marketData.buyVolume / totalVol) * 100) : 50,
    },
    lastCandles: marketData.klines.slice(-5).map(k => ({
      open: k.open, high: k.high, low: k.low, close: k.close, volume: k.volume,
    })),
    sparkline: marketData.tickHistory.slice(-60).map(t => t.price),
  });
});

// Prediction endpoint
app.post('/api/predict', async (req, res) => {
  try {
    const { strikePrice, windowEnd } = req.body;
    if (!strikePrice || isNaN(strikePrice)) {
      return res.status(400).json({ error: 'Valid strike price required' });
    }
    const prediction = await runPrediction(parseFloat(strikePrice), windowEnd ? Number(windowEnd) : null);
    if (!prediction) {
      return res.status(503).json({ error: 'Not enough data yet. Wait a few seconds.' });
    }
    res.json(prediction);
  } catch (e) {
    console.error('[Predict] Error:', e.message);
    res.status(500).json({ error: 'Prediction failed: ' + e.message });
  }
});

// Backtest results
app.get('/api/backtest', (req, res) => {
  if (!backtestResult) {
    return res.json({ accuracy: null, message: 'Backtest not yet run — waiting for data' });
  }
  res.json(backtestResult);
});

// Check resolution — uses stored boundary prices
app.post('/api/check-resolution', (req, res) => {
  const { windowStart, windowEnd } = req.body;

  if (!windowStart || !windowEnd) {
    return res.status(400).json({ error: 'windowStart and windowEnd required' });
  }

  const startEntry = boundaryPrices.get(Number(windowStart));
  const endEntry = boundaryPrices.get(Number(windowEnd));

  // If end boundary not captured yet, tell frontend to retry
  if (!endEntry) {
    return res.json({
      ready: false,
      message: 'End-of-window price not yet captured. Retrying...',
      startCaptured: !!startEntry,
      endCaptured: false,
    });
  }

  // If start boundary missing, use best available approximation
  let startPrice, startSource;
  if (startEntry) {
    startPrice = startEntry.price;
    startSource = startEntry.source;
  } else {
    // Fallback: look through tick history for closest price to windowStart
    const ticks = marketData.tickHistory;
    let closest = null;
    let minDist = Infinity;
    for (const t of ticks) {
      const dist = Math.abs(t.time - Number(windowStart));
      if (dist < minDist) {
        minDist = dist;
        closest = t;
      }
    }
    if (closest && minDist < 30000) { // within 30 seconds
      startPrice = closest.price;
      startSource = 'tick-approx';
    } else {
      startPrice = marketData.chainlinkPrice || marketData.binancePrice;
      startSource = 'fallback-current';
    }
    console.log(`[Resolution] WARNING: Start boundary not captured. Using ${startSource}: $${startPrice}`);
  }

  const endPrice = endEntry.price;
  const priceMoved = endPrice - startPrice;
  const actualResult = endPrice >= startPrice ? 'OVER' : 'UNDER';

  const startTimeLabel = startEntry?.timeLabel || new Date(Number(windowStart)).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York',
  });
  const endTimeLabel = endEntry.timeLabel;

  // Log for verification
  console.log(`\n[Resolution] ════════════════════════════════════════`);
  console.log(`[Resolution] Window: ${startTimeLabel} - ${endTimeLabel} ET`);
  console.log(`[Resolution] Start price (${startSource}): $${startPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`[Resolution] End price (${endEntry.source}): $${endPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`[Resolution] Price moved: ${priceMoved >= 0 ? '+' : ''}$${priceMoved.toFixed(2)}`);
  console.log(`[Resolution] Actual result: ${actualResult} (end ${endPrice >= startPrice ? '>=' : '<'} start)`);
  console.log(`[Resolution] ════════════════════════════════════════\n`);

  res.json({
    ready: true,
    startPrice,
    endPrice,
    priceMoved: Math.round(priceMoved * 100) / 100,
    actualResult,
    startTimeLabel,
    endTimeLabel,
    startSource,
    endSource: endEntry.source,
    startCaptured: !!startEntry,
    endCaptured: true,
  });
});

// Get stored boundary prices (for debugging)
app.get('/api/boundary-prices', (req, res) => {
  const entries = Array.from(boundaryPrices.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50);
  res.json(entries);
});

// Sentiment analysis
app.post('/api/analyze-sentiment', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });

  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured in .env' });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyze this crypto/Bitcoin news or message for market sentiment. Return ONLY valid JSON with this exact structure:
{
  "sentiment": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": 0-100,
  "bullishSignals": ["signal1", "signal2"],
  "bearishSignals": ["signal1", "signal2"],
  "marketImpact": "brief assessment of market impact"
}

Text to analyze:
${text}`
      }],
    });

    const content = message.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      res.json(JSON.parse(jsonMatch[0]));
    } else {
      res.json({ sentiment: 'NEUTRAL', confidence: 50, bullishSignals: [], bearishSignals: [], marketImpact: 'Unable to parse' });
    }
  } catch (e) {
    console.error('[Sentiment] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── WebSocket Server for Client Updates ───
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  // Send initial state
  ws.send(JSON.stringify({
    type: 'init',
    binancePrice: marketData.binancePrice,
    chainlinkPrice: marketData.chainlinkPrice,
    buyVolume: marketData.buyVolume,
    sellVolume: marketData.sellVolume,
    sparkline: marketData.tickHistory.slice(-60).map(t => t.price),
  }));

  ws.on('close', () => clients.delete(ws));
});

function broadcastToClients(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// Periodic market data broadcast
setInterval(() => {
  const totalVol = marketData.buyVolume + marketData.sellVolume;
  broadcastToClients({
    type: 'marketUpdate',
    binancePrice: marketData.binancePrice,
    chainlinkPrice: marketData.chainlinkPrice,
    buyVolume: marketData.buyVolume,
    sellVolume: marketData.sellVolume,
    buyRatio: totalVol > 0 ? Math.round((marketData.buyVolume / totalVol) * 100) : 50,
    volumeStatus: getVolumeStatus().status,
    trend: detectTrend(marketData.tickHistory),
    sparkline: marketData.tickHistory.slice(-60).map(t => t.price),
    lastCandles: marketData.klines.slice(-5).map(k => ({
      open: k.open, close: k.close, high: k.high, low: k.low,
    })),
  });
}, 1000);

// ─── Start ───
server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  connectPolymarket();
  connectBinanceAggTrade();
});
