import React, { useEffect, useState } from 'react';

export default function PriceDisplay({ binancePrice, chainlinkPrice, priceSource, isStale, wsConnected, lastUpdate }) {
  const spread = binancePrice && chainlinkPrice
    ? Math.abs(binancePrice - chainlinkPrice)
    : null;

  const fmt = (p) => p ? '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';

  // Flash effect on price change
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!binancePrice) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 300);
    return () => clearTimeout(t);
  }, [binancePrice]);

  return (
    <div className="card price-display">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        LIVE PRICES
        {/* Pulsing connection dot */}
        <span
          className={`ws-dot ${wsConnected && !isStale ? 'live' : isStale ? 'stale' : 'off'}`}
        />
        {isStale && <span className="stale-badge">STALE</span>}
        {priceSource && !isStale && (
          <span className="source-badge">via {priceSource}</span>
        )}
      </div>
      <div className="price-main">
        <span className="price-label">Live Price (Binance)</span>
        <span className={`price-value big ${flash ? 'price-flash' : ''}`}>{fmt(binancePrice)}</span>
      </div>
      <div className="price-secondary">
        <span className="price-label">Resolution Price (Chainlink)</span>
        <span className="price-value chainlink">{fmt(chainlinkPrice)}</span>
      </div>
      <div className="price-spread">
        <span className="price-label">Spread</span>
        <span className="price-value spread">{spread !== null ? '$' + spread.toFixed(2) : '---'}</span>
      </div>
    </div>
  );
}
