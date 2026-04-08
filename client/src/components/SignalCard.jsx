import React from 'react';

export default function SignalCard({ data, sentiment }) {
  const { indicators, trend, buyRatio, volumeStatus } = data;

  // Calculate combined signal
  let bullishPoints = 0;
  let bearishPoints = 0;

  // Trend
  if (trend?.direction === 'up') bullishPoints += 2;
  if (trend?.direction === 'down') bearishPoints += 2;

  // Order flow
  if (buyRatio > 60) bullishPoints += 2;
  else if (buyRatio < 40) bearishPoints += 2;
  else if (buyRatio > 55) bullishPoints += 1;
  else if (buyRatio < 45) bearishPoints += 1;

  // Volume
  if (volumeStatus === 'SPIKE' && trend?.direction === 'up') bullishPoints += 2;
  if (volumeStatus === 'SPIKE' && trend?.direction === 'down') bearishPoints += 2;
  if (volumeStatus === 'HIGH' && trend?.direction === 'up') bullishPoints += 1;
  if (volumeStatus === 'HIGH' && trend?.direction === 'down') bearishPoints += 1;

  // RSI
  if (indicators?.rsi) {
    if (indicators.rsi < 30) bullishPoints += 2;
    else if (indicators.rsi > 70) bearishPoints += 2;
    else if (indicators.rsi < 45) bullishPoints += 1;
    else if (indicators.rsi > 55) bearishPoints += 1;
  }

  // MACD
  if (indicators?.macd) {
    if (indicators.macd.histogram > 0) bullishPoints += 1;
    else if (indicators.macd.histogram < 0) bearishPoints += 1;
  }

  // Sentiment
  if (sentiment) {
    const sentWeight = sentiment.confidence / 100 * 3;
    if (sentiment.sentiment === 'BULLISH') bullishPoints += sentWeight;
    if (sentiment.sentiment === 'BEARISH') bearishPoints += sentWeight;
  }

  let signal, signalColor, action, description;
  const diff = bullishPoints - bearishPoints;

  if (diff > 2) {
    signal = 'BULLISH';
    signalColor = 'var(--green)';
    action = 'BUY YES';
    description = 'Strong bullish signals detected. Consider buying YES on the 5-minute market.';
  } else if (diff < -2) {
    signal = 'BEARISH';
    signalColor = 'var(--red)';
    action = 'BUY NO';
    description = 'Strong bearish signals detected. Consider buying NO on the 5-minute market.';
  } else {
    signal = 'NEUTRAL';
    signalColor = 'var(--amber)';
    action = 'ARBITRAGE ONLY';
    description = 'No clear direction. Buy YES+NO where combined < $0.97 for guaranteed profit.';
  }

  return (
    <div className="card signal-card" style={{ borderColor: signalColor }}>
      <div className="card-header">POLYMARKET SIGNAL</div>
      <div className="signal-main" style={{ color: signalColor }}>
        {action}
      </div>
      <div className="signal-direction" style={{ color: signalColor }}>
        {signal}
      </div>
      <p className="signal-description">{description}</p>
      <div className="signal-scores">
        <div className="signal-score-row">
          <span>Bullish Score</span>
          <span style={{ color: 'var(--green)' }}>{bullishPoints.toFixed(1)}</span>
        </div>
        <div className="signal-score-row">
          <span>Bearish Score</span>
          <span style={{ color: 'var(--red)' }}>{bearishPoints.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}
