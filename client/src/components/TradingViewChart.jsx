import React, { useEffect, useRef } from 'react';

export default function TradingViewChart() {
  const containerRef = useRef(null);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (scriptLoaded.current) return;
    scriptLoaded.current = true;

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (window.TradingView && containerRef.current) {
        new window.TradingView.widget({
          container_id: 'tradingview-widget',
          symbol: 'BINANCE:BTCUSDT',
          interval: '5',
          timezone: 'Etc/UTC',
          theme: 'dark',
          style: '1',
          locale: 'en',
          toolbar_bg: '#12121a',
          enable_publishing: false,
          allow_symbol_change: false,
          hide_top_toolbar: false,
          hide_side_toolbar: false,
          withdateranges: true,
          save_image: false,
          studies: [
            'RSI@tv-basicstudies',
            'MACD@tv-basicstudies',
            'BB@tv-basicstudies',
            'Volume@tv-basicstudies',
          ],
          width: '100%',
          height: 500,
          studies_overrides: {
            'volume.volume.color.0': '#FF1744',
            'volume.volume.color.1': '#00C853',
          },
        });
      }
    };
    document.head.appendChild(script);
  }, []);

  return (
    <div className="card tradingview-card">
      <div className="card-header">TRADINGVIEW CHART</div>
      <div id="tradingview-widget" ref={containerRef} style={{ width: '100%', height: 500 }} />
    </div>
  );
}
