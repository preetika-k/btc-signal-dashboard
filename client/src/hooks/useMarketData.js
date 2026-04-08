import { useState, useEffect, useCallback } from 'react';

export function useMarketData(addListener) {
  const [data, setData] = useState({
    binancePrice: null,
    chainlinkPrice: null,
    buyVolume: 0,
    sellVolume: 0,
    buyRatio: 50,
    volumeStatus: 'NORMAL',
    trend: { direction: 'flat', acceleration: 0 },
    sparkline: [],
    lastCandles: [],
    indicators: null,
    patterns: [],
    supportResistance: { support: [], resistance: [] },
  });

  // WebSocket live updates
  useEffect(() => {
    if (!addListener) return;
    return addListener((msg) => {
      if (msg.type === 'init' || msg.type === 'marketUpdate') {
        setData(prev => ({
          ...prev,
          binancePrice: msg.binancePrice ?? prev.binancePrice,
          chainlinkPrice: msg.chainlinkPrice ?? prev.chainlinkPrice,
          buyVolume: msg.buyVolume ?? prev.buyVolume,
          sellVolume: msg.sellVolume ?? prev.sellVolume,
          buyRatio: msg.buyRatio ?? prev.buyRatio,
          volumeStatus: msg.volumeStatus ?? prev.volumeStatus,
          trend: msg.trend ?? prev.trend,
          sparkline: msg.sparkline ?? prev.sparkline,
          lastCandles: msg.lastCandles ?? prev.lastCandles,
        }));
      }
      if (msg.type === 'polymarket' || msg.type === 'trade') {
        setData(prev => ({
          ...prev,
          binancePrice: msg.binancePrice ?? prev.binancePrice,
          chainlinkPrice: msg.chainlinkPrice ?? prev.chainlinkPrice,
          buyVolume: msg.buyVolume ?? prev.buyVolume,
          sellVolume: msg.sellVolume ?? prev.sellVolume,
        }));
      }
    });
  }, [addListener]);

  // Periodic REST API fetch for indicators
  const fetchIndicators = useCallback(async () => {
    try {
      const res = await fetch('/api/market-data');
      const json = await res.json();
      setData(prev => ({
        ...prev,
        indicators: json.indicators,
        patterns: json.patterns,
        supportResistance: json.supportResistance,
        binancePrice: json.binancePrice ?? prev.binancePrice,
        chainlinkPrice: json.chainlinkPrice ?? prev.chainlinkPrice,
      }));
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchIndicators();
    const interval = setInterval(fetchIndicators, 5000);
    return () => clearInterval(interval);
  }, [fetchIndicators]);

  return data;
}
