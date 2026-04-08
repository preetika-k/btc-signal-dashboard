import React, { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useMarketData } from './hooks/useMarketData';
import { usePriceWebSocket } from './hooks/usePriceWebSocket';
import PriceDisplay from './components/PriceDisplay';
import TradingViewChart from './components/TradingViewChart';
import TechnicalIndicators from './components/TechnicalIndicators';
import MarketMonitor from './components/MarketMonitor';
import PredictionPanel from './components/PredictionPanel';
import SentimentAnalyzer from './components/SentimentAnalyzer';
import SignalCard from './components/SignalCard';

export default function App() {
  const { connected, addListener } = useWebSocket();
  const marketData = useMarketData(addListener);
  const priceWs = usePriceWebSocket();
  const [sentiment, setSentiment] = useState(null);

  // Use direct WS prices (instant) over backend-proxied prices
  const liveBinancePrice = priceWs.binancePrice ?? marketData.binancePrice;
  const liveChainlinkPrice = priceWs.chainlinkPrice ?? marketData.chainlinkPrice;
  const isConnected = priceWs.wsConnected || connected;

  return (
    <>
      <style>{`
        :root {
          --bg: #0a0a0f;
          --card: #12121a;
          --border: #1e1e2a;
          --green: #00C853;
          --red: #FF1744;
          --amber: #FFB347;
          --cyan: #25F4EE;
          --pink: #FE2C55;
          --text: #e0e0e0;
          --text-dim: #666;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'Inter', -apple-system, sans-serif;
          min-height: 100vh;
        }

        .app {
          max-width: 1440px;
          margin: 0 auto;
          padding: 16px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }

        .header h1 {
          font-size: 22px;
          font-weight: 800;
          background: linear-gradient(135deg, var(--cyan), var(--pink));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .connection-status {
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 12px;
          font-weight: 600;
        }

        .connected { background: rgba(0,200,83,0.15); color: var(--green); }
        .disconnected { background: rgba(255,23,68,0.15); color: var(--red); }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 300px;
          gap: 16px;
        }

        .col-main { display: flex; flex-direction: column; gap: 16px; }
        .col-side { display: flex; flex-direction: column; gap: 16px; }
        .col-monitor { display: flex; flex-direction: column; gap: 16px; }

        .full-width {
          grid-column: 1 / -1;
        }

        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          transition: border-color 0.3s;
        }

        .card:hover { border-color: #2a2a3a; }

        .card-header {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          color: var(--text-dim);
          margin-bottom: 12px;
          text-transform: uppercase;
        }

        /* Price Display */
        .price-main { margin-bottom: 8px; }
        .price-label {
          display: block;
          font-size: 11px;
          color: var(--text-dim);
          margin-bottom: 2px;
        }
        .price-value.big {
          font-size: 36px;
          font-weight: 900;
          color: var(--cyan);
        }
        .price-value.chainlink {
          font-size: 22px;
          font-weight: 700;
          color: var(--amber);
        }
        .price-value.spread {
          font-size: 14px;
          color: var(--text-dim);
        }
        .price-secondary, .price-spread { margin-top: 6px; }

        /* Indicators */
        .indicators-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .indicator-badge {
          border: 1px solid;
          border-radius: 8px;
          padding: 8px 12px;
          min-width: 100px;
        }

        .badge-label {
          display: block;
          font-size: 10px;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .badge-value {
          display: block;
          font-size: 14px;
          font-weight: 700;
          margin-top: 2px;
        }

        .macd-histogram {
          display: flex;
          align-items: center;
          gap: 2px;
          height: 80px;
          padding: 0 4px;
        }

        .macd-bar-wrapper {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .macd-bar {
          width: 100%;
          min-height: 2px;
          border-radius: 1px;
        }

        /* Market Monitor */
        .monitor-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid var(--border);
        }

        .monitor-row:last-child { border-bottom: none; }

        .monitor-label {
          font-size: 11px;
          color: var(--text-dim);
          min-width: 80px;
          flex-shrink: 0;
        }

        .monitor-value { flex: 1; }

        .sparkline { display: block; }
        .sparkline-placeholder { font-size: 11px; color: var(--text-dim); }

        .ratio-bar {
          display: flex;
          height: 8px;
          border-radius: 4px;
          overflow: hidden;
          flex: 1;
          max-width: 120px;
        }

        .ratio-buy { background: var(--green); transition: width 0.5s; }
        .ratio-sell { background: var(--red); transition: width 0.5s; }
        .ratio-text { font-size: 11px; color: var(--text-dim); }

        .volume-badge {
          font-size: 11px;
          font-weight: 700;
          border: 1px solid;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .candle-blocks {
          display: flex;
          gap: 3px;
        }

        .candle-block {
          width: 20px;
          height: 20px;
          border-radius: 3px;
          transition: all 0.3s;
        }

        /* Prediction Panel */
        .strike-input-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .strike-input-row label {
          font-size: 12px;
          color: var(--text-dim);
          white-space: nowrap;
        }

        .strike-input {
          flex: 1;
          background: var(--bg);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 700;
          font-family: 'Inter', sans-serif;
        }

        .strike-input:focus {
          outline: none;
          border-color: var(--cyan);
        }

        .btn-auto {
          background: var(--border);
          color: var(--text);
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 12px;
        }

        .btn-auto:hover { background: #2a2a3a; }

        .windows-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 16px;
        }

        .window-card {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          text-align: center;
          transition: border-color 0.3s, opacity 0.3s;
        }

        .window-card.current-window {
          border-color: var(--green);
          box-shadow: 0 0 8px rgba(0,200,83,0.15);
        }

        .window-card.locked {
          border-color: var(--cyan);
          opacity: 0.7;
        }

        .window-card.closing-soon {
          border-color: var(--amber);
          opacity: 0.5;
        }

        .window-time {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 4px;
        }

        .tz-label {
          font-size: 9px;
          color: var(--text-dim);
          font-weight: 500;
          vertical-align: middle;
        }

        .closing-badge {
          display: inline-block;
          background: var(--amber);
          color: #000;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .window-countdown {
          font-size: 11px;
          color: var(--text-dim);
          margin-bottom: 8px;
        }

        .btn-lock {
          background: linear-gradient(135deg, var(--cyan), var(--pink));
          color: #fff;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.5px;
          transition: opacity 0.2s;
        }

        .btn-lock:hover { opacity: 0.85; }
        .btn-lock:disabled { opacity: 0.4; cursor: not-allowed; }

        .locked-badge {
          display: inline-block;
          background: var(--cyan);
          color: #000;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .locked-prediction {
          background: var(--bg);
          border: 1px solid var(--cyan);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 12px;
        }

        .locked-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .locked-window {
          font-weight: 700;
          font-size: 14px;
        }

        .locked-countdown {
          font-size: 12px;
          color: var(--amber);
          margin-left: auto;
        }

        .prediction-result {
          display: flex;
          align-items: baseline;
          gap: 16px;
          margin-bottom: 8px;
        }

        .prediction-direction {
          font-size: 28px;
          font-weight: 900;
        }

        .prediction-direction.over { color: var(--green); }
        .prediction-direction.under { color: var(--red); }
        .prediction-direction.neutral { color: var(--amber); }

        .prediction-strike {
          font-size: 14px;
          color: var(--text-dim);
        }

        /* Prediction detail rows */
        .pred-detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 5px 0;
          border-bottom: 1px solid rgba(30,30,42,0.5);
        }
        .pred-detail-row:last-of-type { border-bottom: none; }

        .pred-detail-label {
          font-size: 11px;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .pred-detail-value {
          font-size: 13px;
          font-weight: 600;
          text-align: right;
          max-width: 60%;
        }

        .projected-row {
          margin: 8px 0;
          padding: 8px 0;
          border-bottom: 1px solid var(--border);
        }

        /* Model Consensus Panel */
        .model-consensus {
          margin: 10px 0;
          padding: 10px;
          background: rgba(18,18,26,0.6);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .consensus-header {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: var(--cyan);
          margin-bottom: 8px;
        }

        .model-card {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 8px 10px;
          margin-bottom: 6px;
        }

        .model-card.disabled {
          opacity: 0.4;
        }

        .model-card-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
        }

        .model-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .model-dot.active { background: var(--green); box-shadow: 0 0 4px var(--green); }
        .model-dot.inactive { background: var(--text-dim); }

        .model-card-name {
          font-size: 11px;
          font-weight: 700;
          color: var(--text);
        }

        .model-card-weight {
          margin-left: auto;
          font-size: 10px;
          font-weight: 800;
          color: var(--cyan);
          background: rgba(37,244,238,0.1);
          padding: 1px 6px;
          border-radius: 3px;
        }

        .model-card-price {
          font-size: 16px;
          font-weight: 800;
          margin: 2px 0;
        }

        .model-card-details {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 11px;
          color: var(--text-dim);
        }

        .model-card-meta {
          font-size: 10px;
          color: var(--text-dim);
          margin-top: 3px;
          opacity: 0.7;
        }

        .conf-badge {
          padding: 0 5px;
          border-radius: 3px;
          font-weight: 700;
          font-size: 10px;
        }

        .conf-high { background: rgba(0,200,83,0.2); color: var(--green); }
        .conf-moderate { background: rgba(255,179,71,0.2); color: var(--amber); }
        .conf-low { background: rgba(255,23,68,0.2); color: var(--red); }

        .ema-signal {
          font-weight: 700;
        }

        .signal-bullish, .signal-cross-bullish { color: var(--green); }
        .signal-bearish, .signal-cross-bearish { color: var(--red); }
        .signal-weakening-bull, .signal-weakening-bear { color: var(--amber); }
        .signal-neutral { color: var(--text-dim); }

        .model-meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: var(--text-dim);
          margin-top: 4px;
          padding-top: 4px;
          border-top: 1px solid var(--border);
        }

        /* Warnings Panel */
        .warnings-panel {
          margin: 8px 0;
          padding: 8px 10px;
          background: rgba(255,179,71,0.06);
          border: 1px solid rgba(255,179,71,0.2);
          border-radius: 6px;
        }

        .warnings-header {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
          color: var(--amber);
          margin-bottom: 4px;
        }

        .warning-item {
          font-size: 11px;
          color: var(--amber);
          padding: 2px 0;
          display: flex;
          align-items: flex-start;
          gap: 4px;
        }

        .warning-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          background: var(--amber);
          color: #000;
          border-radius: 50%;
          font-size: 9px;
          font-weight: 900;
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* Momentum Panel */
        .momentum-panel {
          margin: 8px 0;
        }

        .momentum-grid {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .mom-cell {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 4px 8px;
          text-align: center;
          min-width: 52px;
          flex: 1;
        }

        .mom-label {
          display: block;
          font-size: 9px;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .mom-value {
          display: block;
          font-size: 12px;
          font-weight: 700;
          margin-top: 1px;
        }

        /* Backtest Panel */
        .backtest-panel {
          margin-top: 10px;
          padding: 8px 10px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 6px;
        }

        .backtest-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
          color: var(--text-dim);
          margin-bottom: 6px;
        }

        .backtest-accuracy {
          font-size: 14px;
          font-weight: 900;
        }

        .backtest-accuracy.good { color: var(--green); }
        .backtest-accuracy.ok { color: var(--amber); }
        .backtest-accuracy.bad { color: var(--red); }

        .backtest-meta {
          font-size: 10px;
          color: var(--text-dim);
          font-weight: 500;
          margin-left: auto;
        }

        .backtest-dots {
          display: flex;
          gap: 3px;
          flex-wrap: wrap;
        }

        .bt-dot {
          width: 10px;
          height: 10px;
          border-radius: 2px;
        }

        .bt-dot.correct { background: var(--green); }
        .bt-dot.wrong { background: var(--red); }

        /* Resolution Log */
        .resolution-log {
          margin-top: 6px;
          padding: 6px 0;
        }

        .res-log-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2px 0;
          font-size: 11px;
        }

        .res-log-label {
          color: var(--text-dim);
        }

        .res-log-value {
          font-weight: 600;
          text-align: right;
        }

        /* Accuracy Dashboard */
        .accuracy-dashboard {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
        }

        .accuracy-header {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: var(--cyan);
          margin-bottom: 10px;
        }

        .accuracy-main-row {
          display: flex;
          gap: 16px;
          margin-bottom: 10px;
        }

        .accuracy-stat {
          flex: 1;
          text-align: center;
          padding: 8px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 6px;
        }

        .accuracy-number {
          display: block;
          font-size: 28px;
          font-weight: 900;
        }

        .accuracy-label {
          display: block;
          font-size: 10px;
          color: var(--text-dim);
          margin-top: 2px;
        }

        .confidence-tiers {
          margin-bottom: 8px;
        }

        .tier-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 3px 0;
          font-size: 11px;
        }

        .tier-label {
          color: var(--text-dim);
        }

        .tier-value {
          font-weight: 600;
        }

        .profitability-note {
          font-size: 11px;
          font-weight: 600;
          padding: 6px 8px;
          background: rgba(30,30,42,0.5);
          border-radius: 4px;
          text-align: center;
        }

        /* Resolution History Table */
        .resolution-table-wrapper {
          margin-top: 12px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
          overflow-x: auto;
        }

        .resolution-table-header {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: var(--text-dim);
          margin-bottom: 8px;
        }

        .resolution-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        .resolution-table th {
          text-align: left;
          padding: 4px 6px;
          color: var(--text-dim);
          font-weight: 700;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }

        .resolution-table td {
          padding: 4px 6px;
          border-bottom: 1px solid rgba(30,30,42,0.3);
          white-space: nowrap;
        }

        .resolution-table .cell-window {
          font-weight: 600;
          color: var(--text);
        }

        .resolution-table .row-correct td {
          background: rgba(0,200,83,0.03);
        }

        .resolution-table .row-wrong td {
          background: rgba(255,23,68,0.03);
        }

        .live-distance-bar {
          margin-top: 10px;
          padding: 8px 10px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .ld-label {
          font-size: 10px;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .ld-value {
          font-size: 16px;
          font-weight: 800;
        }

        .ld-current {
          font-size: 11px;
          color: var(--text-dim);
          margin-left: auto;
        }

        .live-distance {
          font-size: 12px;
          color: var(--text-dim);
          margin-bottom: 12px;
        }

        .breakdown { display: flex; flex-direction: column; gap: 6px; }

        .breakdown-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .breakdown-label {
          font-size: 11px;
          color: var(--text-dim);
          min-width: 120px;
        }

        .breakdown-bar-track {
          flex: 1;
          height: 6px;
          background: var(--bg);
          border-radius: 3px;
          overflow: hidden;
        }

        .breakdown-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s;
        }

        .breakdown-score {
          font-size: 12px;
          font-weight: 700;
          min-width: 30px;
          text-align: right;
        }

        /* Tier Pills */
        .tier-pill {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .tier-pill.tier-green {
          background: rgba(0,200,83,0.2);
          color: var(--green);
          border: 1px solid var(--green);
        }

        .tier-pill.tier-yellow {
          background: rgba(255,179,71,0.2);
          color: var(--amber);
          border: 1px solid var(--amber);
        }

        .tier-pill.tier-red {
          background: rgba(255,23,68,0.2);
          color: var(--red);
          border: 1px solid var(--red);
        }

        .tier-pill-sm {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .tier-pill-sm.tier-green { background: rgba(0,200,83,0.2); color: var(--green); }
        .tier-pill-sm.tier-yellow { background: rgba(255,179,71,0.2); color: var(--amber); }
        .tier-pill-sm.tier-red { background: rgba(255,23,68,0.2); color: var(--red); }

        /* Signal Breakdown */
        .signal-breakdown {
          margin: 10px 0;
          padding: 10px;
          background: rgba(18,18,26,0.6);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .signal-breakdown-header {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: var(--cyan);
          margin-bottom: 8px;
        }

        .signal-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 3px 0;
          font-size: 11px;
          border-bottom: 1px solid rgba(30,30,42,0.3);
        }

        .signal-row:last-of-type { border-bottom: none; }

        .signal-icon { font-size: 12px; flex-shrink: 0; width: 18px; text-align: center; }

        .signal-name {
          font-weight: 700;
          color: var(--text);
          min-width: 80px;
          flex-shrink: 0;
        }

        .signal-dir-badge {
          font-weight: 700;
          font-size: 10px;
          min-width: 50px;
          text-align: center;
        }

        .signal-detail-text {
          color: var(--text-dim);
          font-size: 10px;
          flex: 1;
          text-align: right;
        }

        .signal-summary {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid var(--border);
          font-size: 11px;
          font-weight: 700;
          color: var(--text);
          text-align: center;
        }

        /* AI Confirmation Box */
        .ai-confirmation-box {
          margin: 8px 0;
          padding: 8px 10px;
          background: rgba(37,244,238,0.04);
          border: 1px solid rgba(37,244,238,0.2);
          border-radius: 6px;
        }

        .ai-confirmation-header {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
          color: var(--cyan);
          margin-bottom: 4px;
        }

        .ai-confirmation-verdict {
          font-size: 14px;
          font-weight: 800;
          margin-bottom: 2px;
        }

        .ai-confirmation-reason {
          font-size: 11px;
          color: var(--text-dim);
        }

        .sentiment-applied {
          margin-top: 8px;
          font-size: 11px;
          color: var(--pink);
          font-weight: 600;
        }

        .resolved-prediction {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 8px;
        }

        .resolved-prediction.correct { border-color: var(--green); }
        .resolved-prediction.wrong { border-color: var(--red); }

        .resolved-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }

        .result-correct {
          color: #000;
          background: var(--green);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
        }

        .result-wrong {
          color: #fff;
          background: var(--red);
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 800;
        }

        .resolved-detail {
          font-size: 11px;
          color: var(--text-dim);
        }

        .scorecard {
          margin-top: 12px;
          padding: 10px;
          background: var(--bg);
          border: 1px solid var(--amber);
          border-radius: 8px;
          font-size: 14px;
          font-weight: 700;
          text-align: center;
          color: var(--amber);
        }

        /* Sentiment */
        .sentiment-textarea {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 10px;
          border-radius: 8px;
          font-family: 'Inter', sans-serif;
          font-size: 13px;
          resize: vertical;
          margin-bottom: 8px;
        }

        .sentiment-textarea:focus {
          outline: none;
          border-color: var(--cyan);
        }

        .btn-analyze {
          width: 100%;
          background: linear-gradient(135deg, var(--pink), var(--cyan));
          color: #fff;
          border: none;
          padding: 10px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          font-size: 13px;
          transition: opacity 0.2s;
        }

        .btn-analyze:hover { opacity: 0.85; }
        .btn-analyze:disabled { opacity: 0.4; cursor: not-allowed; }

        .sentiment-error {
          color: var(--red);
          font-size: 12px;
          margin-top: 8px;
        }

        .sentiment-result { margin-top: 12px; }

        .sentiment-badge {
          display: inline-block;
          padding: 4px 14px;
          border-radius: 6px;
          font-weight: 800;
          font-size: 13px;
          color: #000;
          margin-bottom: 10px;
        }

        .signal-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 10px;
        }

        .signal-header {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .signal-item {
          font-size: 12px;
          padding-left: 8px;
        }

        .signal-list.bullish .signal-item { color: var(--green); }
        .signal-list.bearish .signal-item { color: var(--red); }

        .market-impact {
          margin-top: 8px;
        }

        .market-impact p {
          font-size: 12px;
          color: var(--text-dim);
          margin-top: 4px;
        }

        /* Signal Card */
        .signal-card {
          border-width: 2px;
          text-align: center;
        }

        .signal-main {
          font-size: 32px;
          font-weight: 900;
          margin: 12px 0 4px;
        }

        .signal-direction {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 2px;
          margin-bottom: 8px;
        }

        .signal-description {
          font-size: 12px;
          color: var(--text-dim);
          margin-bottom: 12px;
        }

        .signal-scores {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .signal-score-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
        }

        .loading {
          color: var(--text-dim);
          font-size: 12px;
        }

        /* TradingView */
        .tradingview-card { padding: 0; overflow: hidden; }
        .tradingview-card .card-header { padding: 16px 16px 0; }

        /* Responsive */
        @media (max-width: 1100px) {
          .dashboard-grid {
            grid-template-columns: 1fr 1fr;
          }
          .col-monitor {
            grid-column: 1 / -1;
            flex-direction: row;
            flex-wrap: wrap;
          }
          .col-monitor > * { flex: 1; min-width: 280px; }
        }

        @media (max-width: 700px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
          .windows-grid {
            grid-template-columns: 1fr;
          }
        }

        /* WebSocket status dot */
        .ws-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }

        .ws-dot.live {
          background: var(--green);
          box-shadow: 0 0 6px var(--green);
          animation: pulse-dot 1.5s ease-in-out infinite;
        }

        .ws-dot.stale {
          background: var(--amber);
          box-shadow: 0 0 6px var(--amber);
          animation: pulse-dot 0.5s ease-in-out infinite;
        }

        .ws-dot.off {
          background: var(--red);
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }

        .stale-badge {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #000;
          background: var(--amber);
          padding: 1px 6px;
          border-radius: 3px;
        }

        .source-badge {
          font-size: 9px;
          color: var(--text-dim);
          font-weight: 500;
        }

        .price-flash {
          animation: flash-price 0.3s ease-out;
        }

        @keyframes flash-price {
          0% { text-shadow: 0 0 12px var(--cyan); }
          100% { text-shadow: none; }
        }

        /* Animations */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .card { animation: fadeIn 0.3s ease-out; }
      `}</style>

      <div className="app">
        <div className="header">
          <h1>BTC Signal Dashboard</h1>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'LIVE' : 'CONNECTING...'}
          </span>
        </div>

        <div className="dashboard-grid">
          {/* Left Column */}
          <div className="col-main">
            <PriceDisplay
              binancePrice={liveBinancePrice}
              chainlinkPrice={liveChainlinkPrice}
              priceSource={priceWs.priceSource}
              isStale={priceWs.isStale}
              wsConnected={priceWs.wsConnected}
              lastUpdate={priceWs.lastUpdate}
            />
            <TechnicalIndicators
              indicators={marketData.indicators}
              patterns={marketData.patterns}
            />
            <SentimentAnalyzer onSentimentUpdate={setSentiment} />
          </div>

          {/* Center Column */}
          <div className="col-side">
            <PredictionPanel
              chainlinkPrice={liveChainlinkPrice}
            />
            <SignalCard data={marketData} sentiment={sentiment} />
          </div>

          {/* Right Column - Monitor */}
          <div className="col-monitor">
            <MarketMonitor data={{ ...marketData, binancePrice: liveBinancePrice }} />
          </div>

          {/* Full Width Chart */}
          <div className="full-width">
            <TradingViewChart />
          </div>
        </div>
      </div>
    </>
  );
}
