import React from 'react';

function Sparkline({ data }) {
  if (!data || data.length < 2) return <div className="sparkline-placeholder">Waiting for data...</div>;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 200;
  const h = 40;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  const lastPrice = data[data.length - 1];
  const firstPrice = data[0];
  const color = lastPrice >= firstPrice ? 'var(--green)' : 'var(--red)';

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="sparkline">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

function CandleBlocks({ candles }) {
  if (!candles || candles.length === 0) return null;
  return (
    <div className="candle-blocks">
      {candles.map((c, i) => (
        <div
          key={i}
          className="candle-block"
          style={{
            backgroundColor: c.close >= c.open ? 'var(--green)' : 'var(--red)',
            opacity: 0.4 + (i / candles.length) * 0.6,
          }}
          title={`O:${c.open.toFixed(0)} C:${c.close.toFixed(0)} H:${c.high.toFixed(0)} L:${c.low.toFixed(0)}`}
        />
      ))}
    </div>
  );
}

export default function MarketMonitor({ data }) {
  const { binancePrice, trend, buyRatio, volumeStatus, sparkline, lastCandles } = data;

  const trendArrow = trend?.direction === 'up' ? '\u2191' : trend?.direction === 'down' ? '\u2193' : '\u2192';
  const trendColor = trend?.direction === 'up' ? 'var(--green)' : trend?.direction === 'down' ? 'var(--red)' : 'var(--amber)';

  const volColor = volumeStatus === 'SPIKE' ? 'var(--pink)' :
    volumeStatus === 'HIGH' ? 'var(--amber)' :
    volumeStatus === 'LOW' ? 'var(--text-dim)' : 'var(--green)';

  return (
    <div className="card market-monitor">
      <div className="card-header">MARKET MONITOR</div>

      <div className="monitor-row">
        <span className="monitor-label">Price</span>
        <span className="monitor-value" style={{ fontSize: 20, fontWeight: 700 }}>
          {binancePrice ? '$' + binancePrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '---'}
        </span>
        <span style={{ color: trendColor, fontSize: 24, marginLeft: 8 }}>{trendArrow}</span>
      </div>

      <div className="monitor-row">
        <span className="monitor-label">60s Sparkline</span>
        <Sparkline data={sparkline} />
      </div>

      <div className="monitor-row">
        <span className="monitor-label">Buy/Sell Ratio</span>
        <div className="ratio-bar">
          <div className="ratio-buy" style={{ width: `${buyRatio || 50}%` }} />
          <div className="ratio-sell" style={{ width: `${100 - (buyRatio || 50)}%` }} />
        </div>
        <span className="ratio-text">{buyRatio ?? 50}% buy</span>
      </div>

      <div className="monitor-row">
        <span className="monitor-label">Volume</span>
        <span className="volume-badge" style={{ color: volColor, borderColor: volColor }}>
          {volumeStatus || 'NORMAL'}
        </span>
      </div>

      <div className="monitor-row">
        <span className="monitor-label">Last 5 Candles</span>
        <CandleBlocks candles={lastCandles} />
      </div>
    </div>
  );
}
