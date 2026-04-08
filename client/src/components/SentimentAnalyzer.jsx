import React, { useState } from 'react';

export default function SentimentAnalyzer({ onSentimentUpdate }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze-sentiment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        onSentimentUpdate(data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const sentColor = result?.sentiment === 'BULLISH' ? 'var(--green)' :
    result?.sentiment === 'BEARISH' ? 'var(--red)' : 'var(--amber)';

  return (
    <div className="card">
      <div className="card-header">NEWS SENTIMENT ANALYZER</div>
      <textarea
        className="sentiment-textarea"
        placeholder="Paste Telegram messages, crypto news, or any relevant text..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
      />
      <button className="btn-analyze" onClick={analyze} disabled={loading || !text.trim()}>
        {loading ? 'Analyzing...' : 'Analyze Sentiment'}
      </button>

      {error && <div className="sentiment-error">{error}</div>}

      {result && (
        <div className="sentiment-result">
          <div className="sentiment-badge" style={{ backgroundColor: sentColor }}>
            {result.sentiment} — {result.confidence}% confidence
          </div>

          {result.bullishSignals?.length > 0 && (
            <div className="signal-list bullish">
              <span className="signal-header">Bullish Signals</span>
              {result.bullishSignals.map((s, i) => <span key={i} className="signal-item">+ {s}</span>)}
            </div>
          )}

          {result.bearishSignals?.length > 0 && (
            <div className="signal-list bearish">
              <span className="signal-header">Bearish Signals</span>
              {result.bearishSignals.map((s, i) => <span key={i} className="signal-item">- {s}</span>)}
            </div>
          )}

          {result.marketImpact && (
            <div className="market-impact">
              <span className="signal-header">Market Impact</span>
              <p>{result.marketImpact}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
