import React, { useState, useEffect, useCallback } from 'react';

const ET_OPTIONS = { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' };

function fmtET(ts) {
  return new Date(ts).toLocaleTimeString('en-US', ET_OPTIONS);
}

function getNext15MinWindows() {
  const now = Date.now();
  const msIn15Min = 15 * 60 * 1000;
  const currentWindowStart = Math.floor(now / msIn15Min) * msIn15Min;

  const windows = [];
  for (let i = 0; i < 3; i++) {
    const start = currentWindowStart + i * msIn15Min;
    const end = start + msIn15Min;
    const timeLeft = end - now;
    const isCurrent = i === 0;
    const closingSoon = isCurrent && timeLeft <= 60000;

    windows.push({
      start,
      end,
      label: fmtET(start),
      endLabel: fmtET(end),
      isCurrent,
      closingSoon,
      timeLeft,
    });
  }
  return windows;
}

function formatCountdown(ms) {
  if (ms <= 0) return '0:00';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function fmt(p) {
  return p != null ? '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';
}

function fmtShort(p) {
  return p != null ? '$' + Math.round(p).toLocaleString('en-US') : '---';
}

// ─── Locked Prediction Detail Card (v5 Signal Scoring) ───
function LockedPredictionCard({ pred, chainlinkPrice, now }) {
  const p = pred.prediction;
  const timeLeft = pred.windowEnd - now;
  const dist = chainlinkPrice != null ? chainlinkPrice - pred.strikePrice : null;
  const mom = p.momentum || {};
  const signals = p.signals || { total: 0, overCount: 0, underCount: 0, neutralCount: 0, list: [] };

  const tierColors = {
    GREEN: { border: 'var(--green)', bg: 'rgba(0,200,83,0.06)' },
    YELLOW: { border: 'var(--amber)', bg: 'rgba(255,179,71,0.06)' },
    RED: { border: 'var(--red)', bg: 'rgba(255,23,68,0.06)' },
  };
  const tc = tierColors[p.tier] || tierColors.RED;

  const dirIcon = (d) => d === 'OVER' ? '\u2705' : d === 'UNDER' ? '\u274C' : '\u2014';
  const dirColor = (d) => d === 'OVER' ? 'var(--green)' : d === 'UNDER' ? 'var(--red)' : 'var(--text-dim)';

  return (
    <div className="locked-prediction" style={{ borderColor: tc.border, background: tc.bg }}>
      <div className="locked-header">
        <span className="locked-badge">LOCKED</span>
        <span className={`tier-pill tier-${(p.tier || 'RED').toLowerCase()}`}>
          {p.tier}: {p.tierLabel}
        </span>
        <span className="locked-window">{pred.windowLabel} — {fmtET(pred.windowEnd)}</span>
        <span className="locked-countdown">
          {timeLeft > 0 ? `Resolves in ${formatCountdown(timeLeft)}` : 'Resolving...'}
        </span>
      </div>

      {/* Main prediction result */}
      <div className="prediction-result">
        <span className={`prediction-direction ${p.direction.toLowerCase()}`}>
          {p.direction} {p.confidence}%
        </span>
        <span className="prediction-strike">Strike: {fmt(pred.strikePrice)}</span>
      </div>

      {/* Projected price */}
      <div className="pred-detail-row projected-row">
        <span className="pred-detail-label">Projected price in {p.minutesRemaining?.toFixed(1) ?? '5'}min</span>
        <span className="pred-detail-value" style={{ color: dirColor(p.direction), fontSize: 20, fontWeight: 800 }}>
          {fmt(p.projectedPrice)}
        </span>
      </div>

      {/* SIGNAL BREAKDOWN */}
      <div className="signal-breakdown">
        <div className="signal-breakdown-header">
          SIGNAL BREAKDOWN — {signals.overCount} OVER / {signals.underCount} UNDER / {signals.neutralCount} NEUTRAL
        </div>
        {signals.list.map((s, i) => (
          <div key={i} className="signal-row">
            <span className="signal-icon">{dirIcon(s.direction)}</span>
            <span className="signal-name">{s.name}</span>
            <span className="signal-dir-badge" style={{ color: dirColor(s.direction) }}>{s.direction}</span>
            <span className="signal-detail-text">{s.detail}</span>
          </div>
        ))}
        <div className="signal-summary">
          Signals: {Math.max(signals.overCount, signals.underCount)}/10 {p.direction} | Confidence: {p.confidence}% | {p.tierLabel}
        </div>
      </div>

      {/* DISQUALIFIERS */}
      {p.disqualifiers && p.disqualifiers.length > 0 && (
        <div className="warnings-panel">
          <div className="warnings-header">DISQUALIFIERS</div>
          {p.disqualifiers.map((d, i) => (
            <div key={i} className="warning-item">
              <span className="warning-icon">!</span> {d}
            </div>
          ))}
        </div>
      )}

      {/* AI CONFIRMATION (GREEN tier only) */}
      {p.aiConfirmation && (
        <div className="ai-confirmation-box">
          <div className="ai-confirmation-header">AI CONFIRMATION</div>
          <div className="ai-confirmation-verdict" style={{
            color: p.aiConfirmation.verdict === 'CONFIRM' ? 'var(--green)' : 'var(--amber)'
          }}>
            {p.aiConfirmation.verdict} ({p.aiConfirmation.adjustedConfidence}%)
          </div>
          <div className="ai-confirmation-reason">{p.aiConfirmation.reason}</div>
        </div>
      )}

      {/* MOMENTUM */}
      <div className="momentum-grid">
        <div className="mom-cell">
          <span className="mom-label">Buy Ratio</span>
          <span className="mom-value" style={{ color: mom.buyRatio > 55 ? 'var(--green)' : mom.buyRatio < 45 ? 'var(--red)' : 'var(--text-dim)' }}>
            {mom.buyRatio}%
          </span>
        </div>
        <div className="mom-cell">
          <span className="mom-label">Volume</span>
          <span className="mom-value" style={{
            color: mom.volumeStatus === 'SPIKE' || mom.volumeStatus === 'HIGH' ? 'var(--green)' : mom.volumeStatus === 'LOW' ? 'var(--red)' : 'var(--text-dim)'
          }}>
            {mom.volumeStatus}
          </span>
        </div>
        <div className="mom-cell">
          <span className="mom-label">RSI</span>
          <span className="mom-value" style={{
            color: mom.rsi > 70 ? 'var(--red)' : mom.rsi < 30 ? 'var(--green)' : 'var(--text-dim)'
          }}>
            {mom.rsi?.toFixed(1) ?? '---'}
          </span>
        </div>
        <div className="mom-cell">
          <span className="mom-label">MACD</span>
          <span className="mom-value" style={{
            color: mom.macdHistogram > 0 ? 'var(--green)' : mom.macdHistogram < 0 ? 'var(--red)' : 'var(--text-dim)'
          }}>
            {mom.macdHistogram != null ? (mom.macdHistogram >= 0 ? '+' : '') + mom.macdHistogram.toFixed(2) : '---'}
          </span>
        </div>
        <div className="mom-cell">
          <span className="mom-label">Candles</span>
          <span className="mom-value" style={{
            color: mom.consecutiveGreen > 0 ? 'var(--green)' : mom.consecutiveRed > 0 ? 'var(--red)' : 'var(--text-dim)'
          }}>
            {mom.consecutiveGreen > 0 ? `${mom.consecutiveGreen} green` : mom.consecutiveRed > 0 ? `${mom.consecutiveRed} red` : 'mixed'}
          </span>
        </div>
      </div>

      {/* Live distance tracker */}
      <div className="live-distance-bar">
        <span className="ld-label">Live distance from strike:</span>
        <span className="ld-value" style={{ color: dist > 0 ? 'var(--green)' : dist < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
          {dist != null ? `${dist >= 0 ? '+' : ''}${fmt(dist)}` : '---'}
        </span>
        <span className="ld-current">Now: {fmt(chainlinkPrice)}</span>
      </div>
    </div>
  );
}

// ─── Resolution Log Card (shown inline after resolution) ───
function ResolutionLogCard({ pred }) {
  const priceMoved = pred.priceMoved || 0;
  const predConf = pred.prediction.confidence || pred.prediction.overProbability || 50;
  const tier = pred.prediction.tier || 'RED';

  return (
    <div className={`resolved-prediction ${pred.correct ? 'correct' : 'wrong'}`}>
      <div className="resolved-header">
        <span className={pred.correct ? 'result-correct' : 'result-wrong'}>
          {pred.correct ? 'CORRECT \u2713' : 'WRONG \u2717'}
        </span>
        <span className={`tier-pill-sm tier-${tier.toLowerCase()}`}>{tier}</span>
        <span>{pred.windowLabel} — {fmtET(pred.windowEnd)} ET</span>
      </div>
      <div className="resolution-log">
        <div className="res-log-row">
          <span className="res-log-label">Start price (Chainlink):</span>
          <span className="res-log-value">{fmt(pred.startPrice)}</span>
        </div>
        <div className="res-log-row">
          <span className="res-log-label">End price (Chainlink):</span>
          <span className="res-log-value">{fmt(pred.endPrice)}</span>
        </div>
        <div className="res-log-row">
          <span className="res-log-label">Price moved:</span>
          <span className="res-log-value" style={{ color: priceMoved >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {priceMoved >= 0 ? '+' : ''}{fmt(priceMoved)}
          </span>
        </div>
        <div className="res-log-row">
          <span className="res-log-label">Actual result:</span>
          <span className="res-log-value" style={{ color: pred.actualResult === 'OVER' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
            {pred.actualResult} (end {pred.actualResult === 'OVER' ? '>=' : '<'} start)
          </span>
        </div>
        <div className="res-log-row">
          <span className="res-log-label">My prediction was:</span>
          <span className="res-log-value">
            {pred.prediction.direction} {predConf}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Accuracy Dashboard ───
function AccuracyDashboard({ history }) {
  if (history.length === 0) return null;

  const total = history.length;
  const correct = history.filter(h => h.correct).length;
  const pct = Math.round((correct / total) * 100);

  // Last 10
  const last10 = history.slice(-10);
  const last10Correct = last10.filter(h => h.correct).length;
  const last10Pct = last10.length > 0 ? Math.round((last10Correct / last10.length) * 100) : 0;

  // By tier
  const greenTrades = history.filter(h => h.prediction.tier === 'GREEN');
  const yellowTrades = history.filter(h => h.prediction.tier === 'YELLOW');
  const redTrades = history.filter(h => h.prediction.tier === 'RED');

  const greenCorrect = greenTrades.filter(h => h.correct).length;
  const yellowCorrect = yellowTrades.filter(h => h.correct).length;
  const redCorrect = redTrades.filter(h => h.correct).length;

  const tierRow = (label, correct, total, color, suffix) => (
    <div className="tier-row" key={label}>
      <span className="tier-label">{label}:</span>
      <span className="tier-value" style={{ color }}>
        {total > 0 ? `${correct}/${total} correct (${Math.round((correct / total) * 100)}%)${suffix || ''}` : 'No data'}
      </span>
    </div>
  );

  const isProfitable = pct > 52;

  return (
    <div className="accuracy-dashboard">
      <div className="accuracy-header">ACCURACY DASHBOARD</div>

      <div className="accuracy-main-row">
        <div className="accuracy-stat">
          <span className="accuracy-number" style={{ color: pct >= 55 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)' }}>
            {pct}%
          </span>
          <span className="accuracy-label">Overall ({correct}/{total})</span>
        </div>
        <div className="accuracy-stat">
          <span className="accuracy-number" style={{ color: last10Pct >= 55 ? 'var(--green)' : last10Pct >= 50 ? 'var(--amber)' : 'var(--red)' }}>
            {last10Pct}%
          </span>
          <span className="accuracy-label">Last 10 ({last10Correct}/{last10.length})</span>
        </div>
      </div>

      <div className="confidence-tiers">
        {tierRow('GREEN trades', greenCorrect, greenTrades.length, 'var(--green)')}
        {tierRow('YELLOW (would have)', yellowCorrect, yellowTrades.length, 'var(--amber)')}
        {tierRow('RED (would have)', redCorrect, redTrades.length, 'var(--text-dim)')}
      </div>

      <div className="profitability-note" style={{ color: isProfitable ? 'var(--green)' : 'var(--red)' }}>
        {isProfitable
          ? `Profitable at ${pct}% accuracy (threshold: 52% on even-odds trades)`
          : `Not profitable at ${pct}% accuracy (need >52% on even-odds trades)`}
      </div>
    </div>
  );
}

// ─── Resolution History Table ───
function ResolutionHistoryTable({ history }) {
  if (history.length === 0) return null;

  // Show last 20 in reverse chronological order
  const rows = history.slice(-20).reverse();

  return (
    <div className="resolution-table-wrapper">
      <div className="resolution-table-header">RESOLUTION HISTORY</div>
      <table className="resolution-table">
        <thead>
          <tr>
            <th>Window</th>
            <th>Tier</th>
            <th>Start Price</th>
            <th>End Price</th>
            <th>Move</th>
            <th>Actual</th>
            <th>Predicted</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const conf = r.prediction.confidence || r.prediction.overProbability || 50;
            const tier = r.prediction.tier || 'RED';
            const move = r.priceMoved || 0;
            return (
              <tr key={i} className={r.correct ? 'row-correct' : 'row-wrong'}>
                <td className="cell-window">{r.windowLabel}-{fmtET(r.windowEnd)}</td>
                <td>
                  <span className={`tier-pill-sm tier-${tier.toLowerCase()}`}>{tier}</span>
                </td>
                <td>{fmtShort(r.startPrice)}</td>
                <td>{fmtShort(r.endPrice)}</td>
                <td style={{ color: move >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {move >= 0 ? '+' : ''}{fmt(move)}
                </td>
                <td style={{ color: r.actualResult === 'OVER' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                  {r.actualResult}
                </td>
                <td>
                  <span style={{ color: r.prediction.direction === 'OVER' ? 'var(--green)' : r.prediction.direction === 'UNDER' ? 'var(--red)' : 'var(--amber)' }}>
                    {r.prediction.direction}
                  </span>
                  {' '}{conf}%
                </td>
                <td>
                  <span className={r.correct ? 'result-correct' : 'result-wrong'}>
                    {r.correct ? '\u2713' : '\u2717'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PredictionPanel({ chainlinkPrice }) {
  const [strikePrice, setStrikePrice] = useState('');
  const [windows, setWindows] = useState(getNext15MinWindows());
  const [lockedPredictions, setLockedPredictions] = useState([]);
  const [history, setHistory] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [backtest, setBacktest] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
      setWindows(getNext15MinWindows());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch backtest results periodically
  useEffect(() => {
    const fetchBacktest = async () => {
      try {
        const res = await fetch('/api/backtest');
        if (res.ok) {
          const data = await res.json();
          if (data) setBacktest(data);
        }
      } catch (e) {}
    };
    fetchBacktest();
    const interval = setInterval(fetchBacktest, 60000);
    return () => clearInterval(interval);
  }, []);

  // Resolve expired predictions — wait 5s after window end for boundary capture
  useEffect(() => {
    for (const pred of lockedPredictions) {
      if (now >= pred.windowEnd + 5000 && !pred.resolved && !pred.resolving) {
        resolvePrediction(pred);
      }
    }
  }, [now, lockedPredictions]);

  const resolvePrediction = useCallback(async (pred) => {
    setLockedPredictions(prev => prev.map(p =>
      p.id === pred.id ? { ...p, resolving: true } : p
    ));
    try {
      const res = await fetch('/api/check-resolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          windowStart: pred.windowStart,
          windowEnd: pred.windowEnd,
        }),
      });
      const data = await res.json();

      // If server says not ready (end boundary not captured yet), retry in 3s
      if (!data.ready) {
        console.log(`[Resolution] Not ready yet for window ${pred.windowLabel}. Retrying in 3s...`);
        setLockedPredictions(prev => prev.map(p =>
          p.id === pred.id ? { ...p, resolving: false } : p
        ));
        setTimeout(() => resolvePrediction(pred), 3000);
        return;
      }

      // Determine correctness: compare actual result to our prediction
      const actualResult = data.actualResult; // 'OVER' or 'UNDER'
      const predictedDirection = pred.prediction.direction === 'NEUTRAL'
        ? (pred.prediction.overProbability > 50 ? 'OVER' : 'UNDER')
        : pred.prediction.direction;
      const correct = actualResult === predictedDirection;

      const predConf = pred.prediction.confidence || pred.prediction.overProbability || 50;

      // Verification logging (console)
      console.log(`\n════════════════════════════════════════`);
      console.log(`Window: ${pred.windowLabel} - ${fmtET(pred.windowEnd)} ET`);
      console.log(`Tier: ${pred.prediction.tier || 'N/A'} (${pred.prediction.tierLabel || 'N/A'})`);
      console.log(`Start price (Chainlink): $${data.startPrice?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      console.log(`End price (Chainlink): $${data.endPrice?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      console.log(`Price moved: ${data.priceMoved >= 0 ? '+' : ''}$${data.priceMoved?.toFixed(2)}`);
      console.log(`Actual result: ${actualResult} (end ${actualResult === 'OVER' ? '>=' : '<'} start)`);
      console.log(`My prediction was: ${pred.prediction.direction} ${predConf}%`);
      console.log(`Result: ${correct ? 'CORRECT \u2713' : 'WRONG \u2717'}`);
      console.log(`════════════════════════════════════════\n`);

      const resolvedPred = {
        ...pred,
        resolved: true,
        resolving: false,
        startPrice: data.startPrice,
        endPrice: data.endPrice,
        priceMoved: data.priceMoved,
        actualResult,
        correct,
        startSource: data.startSource,
        endSource: data.endSource,
      };

      setLockedPredictions(prev => prev.map(p =>
        p.id === pred.id ? resolvedPred : p
      ));
      setHistory(prev => [...prev, resolvedPred]);
    } catch (e) {
      console.error('[Resolution] Error:', e.message);
      setLockedPredictions(prev => prev.map(p =>
        p.id === pred.id ? { ...p, resolving: false } : p
      ));
      setTimeout(() => resolvePrediction(pred), 5000);
    }
  }, []);

  const lockPrediction = async (window) => {
    const strike = parseFloat(strikePrice);
    if (isNaN(strike) || strike <= 0) return alert('Enter a valid strike price');

    try {
      const res = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strikePrice: strike, windowEnd: window.end }),
      });
      if (!res.ok) {
        const err = await res.json();
        return alert(err.error || 'Prediction failed');
      }
      const prediction = await res.json();

      console.log(`[Prediction] Locked: ${prediction.direction} ${prediction.confidence}% (${prediction.tier}) for window ${fmtET(window.start)} - ${fmtET(window.end)} ET, strike $${strike}`);

      setLockedPredictions(prev => [...prev, {
        id: Date.now(),
        strikePrice: strike,
        windowStart: window.start,
        windowEnd: window.end,
        windowLabel: fmtET(window.start),
        prediction,
        lockedAt: Date.now(),
        resolved: false,
        resolving: false,
        // Resolution fields (filled after resolve)
        startPrice: null,
        endPrice: null,
        priceMoved: null,
        actualResult: null,
        correct: null,
      }]);
    } catch (e) {
      alert('Prediction failed: ' + e.message);
    }
  };

  return (
    <div className="card prediction-panel">
      <div className="card-header">15-MINUTE PREDICTION ENGINE</div>

      {/* Accuracy Dashboard at the top */}
      <AccuracyDashboard history={history} />

      <div className="strike-input-row">
        <label>Strike Price ($)</label>
        <input
          type="number"
          value={strikePrice}
          onChange={(e) => setStrikePrice(e.target.value)}
          placeholder={chainlinkPrice ? chainlinkPrice.toFixed(2) : 'Enter strike price'}
          className="strike-input"
        />
        <button className="btn-auto" onClick={() => chainlinkPrice && setStrikePrice(Math.round(chainlinkPrice).toString())}>
          Auto
        </button>
      </div>

      <div className="windows-grid">
        {windows.map((w, i) => {
          const isLocked = lockedPredictions.some(p => p.windowStart === w.start && !p.resolved);
          const canLock = !isLocked && strikePrice && !w.closingSoon;
          return (
            <div key={w.start} className={`window-card ${isLocked ? 'locked' : ''} ${w.closingSoon ? 'closing-soon' : ''} ${w.isCurrent ? 'current-window' : ''}`}>
              <div className="window-time">{w.label} — {w.endLabel} <span className="tz-label">ET</span></div>
              <div className="window-countdown">
                {w.isCurrent
                  ? w.closingSoon
                    ? 'CLOSING SOON'
                    : `LIVE \u2014 closes in ${formatCountdown(w.timeLeft)}`
                  : `Starts in ${formatCountdown(w.start - now)}`}
              </div>
              {isLocked ? (
                <span className="locked-badge">LOCKED</span>
              ) : w.closingSoon ? (
                <span className="closing-badge">CLOSING SOON</span>
              ) : (
                <button className="btn-lock" onClick={() => lockPrediction(w)} disabled={!canLock}>
                  LOCK PREDICTION
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Active Predictions */}
      {lockedPredictions.filter(p => !p.resolved).map(pred => (
        <LockedPredictionCard
          key={pred.id}
          pred={pred}
          chainlinkPrice={chainlinkPrice}
          now={now}
        />
      ))}

      {/* Resolved — show detailed log cards for last 5 */}
      {lockedPredictions.filter(p => p.resolved).slice(-5).reverse().map(pred => (
        <ResolutionLogCard key={pred.id} pred={pred} />
      ))}

      {/* Backtest Results */}
      {backtest && backtest.accuracy != null && (
        <div className="backtest-panel">
          <div className="backtest-header">
            <span>BACKTEST</span>
            <span className={`backtest-accuracy ${backtest.accuracy >= 60 ? 'good' : backtest.accuracy >= 50 ? 'ok' : 'bad'}`}>
              {backtest.accuracy}%
            </span>
            <span className="backtest-meta">{backtest.correct}/{backtest.total} correct</span>
          </div>
          <div className="backtest-dots">
            {backtest.results?.slice(-20).map((r, i) => (
              <span key={i} className={`bt-dot ${r.correct ? 'correct' : 'wrong'}`} title={`${r.predicted} ${r.confidence}% \u2192 ${r.actual}`} />
            ))}
          </div>
        </div>
      )}

      {/* Resolution History Table */}
      <ResolutionHistoryTable history={history} />
    </div>
  );
}
