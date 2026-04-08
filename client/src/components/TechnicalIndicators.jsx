import React from 'react';

function Badge({ label, value, signal }) {
  const color = signal === 'bullish' ? 'var(--green)' : signal === 'bearish' ? 'var(--red)' : 'var(--amber)';
  return (
    <div className="indicator-badge" style={{ borderColor: color }}>
      <span className="badge-label">{label}</span>
      <span className="badge-value" style={{ color }}>{value}</span>
    </div>
  );
}

function MACDHistogram({ history }) {
  if (!history || history.length === 0) return null;
  const max = Math.max(...history.map(Math.abs), 1);
  return (
    <div className="macd-histogram">
      {history.map((v, i) => (
        <div key={i} className="macd-bar-wrapper">
          <div
            className="macd-bar"
            style={{
              height: `${Math.abs(v) / max * 40}px`,
              backgroundColor: v >= 0 ? 'var(--green)' : 'var(--red)',
              transform: v < 0 ? 'translateY(0)' : 'none',
              alignSelf: v >= 0 ? 'flex-end' : 'flex-start',
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function TechnicalIndicators({ indicators, patterns }) {
  if (!indicators) return <div className="card"><div className="card-header">TECHNICAL ANALYSIS</div><p className="loading">Loading indicators...</p></div>;

  const { rsi, macd, bollingerBands: bb, sma20, sma50, momentum } = indicators;

  const rsiSignal = rsi > 70 ? 'bearish' : rsi < 30 ? 'bullish' : rsi > 55 ? 'bullish' : rsi < 45 ? 'bearish' : 'neutral';
  const macdSignal = macd ? (macd.histogram > 0 ? 'bullish' : macd.histogram < 0 ? 'bearish' : 'neutral') : 'neutral';
  const smaSignal = sma20 && sma50 ? (sma20 > sma50 ? 'bullish' : 'bearish') : 'neutral';

  const fmtMom = (v) => v !== null ? (v > 0 ? '+' : '') + v.toFixed(4) + '%' : '---';
  const momSignal = (v) => v === null ? 'neutral' : v > 0.01 ? 'bullish' : v < -0.01 ? 'bearish' : 'neutral';

  return (
    <div className="card">
      <div className="card-header">TECHNICAL ANALYSIS</div>
      <div className="indicators-grid">
        <Badge label="RSI (14)" value={rsi ?? '---'} signal={rsiSignal} />
        <Badge label="MACD" value={macd ? macd.histogram.toFixed(2) : '---'} signal={macdSignal} />
        <Badge label="SMA Cross" value={sma20 && sma50 ? (sma20 > sma50 ? 'GOLDEN' : 'DEATH') : '---'} signal={smaSignal} />
        {bb && (
          <Badge
            label="BB Position"
            value={`$${bb.lower.toFixed(0)} — $${bb.upper.toFixed(0)}`}
            signal="neutral"
          />
        )}
      </div>

      {macd && macd.history && (
        <div style={{ marginTop: 12 }}>
          <div className="badge-label" style={{ marginBottom: 4 }}>MACD Histogram</div>
          <MACDHistogram history={macd.history} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <div className="badge-label" style={{ marginBottom: 8 }}>MOMENTUM (Rate of Change)</div>
        <div className="indicators-grid">
          <Badge label="1 min" value={fmtMom(momentum?.m1)} signal={momSignal(momentum?.m1)} />
          <Badge label="3 min" value={fmtMom(momentum?.m3)} signal={momSignal(momentum?.m3)} />
          <Badge label="5 min" value={fmtMom(momentum?.m5)} signal={momSignal(momentum?.m5)} />
          <Badge label="10 min" value={fmtMom(momentum?.m10)} signal={momSignal(momentum?.m10)} />
          <Badge label="15 min" value={fmtMom(momentum?.m15)} signal={momSignal(momentum?.m15)} />
        </div>
      </div>

      {patterns && patterns.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="badge-label" style={{ marginBottom: 8 }}>CANDLESTICK PATTERNS</div>
          <div className="indicators-grid">
            {patterns.map((p, i) => (
              <Badge key={i} label={p.name} value={p.signal.toUpperCase()} signal={p.signal} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
