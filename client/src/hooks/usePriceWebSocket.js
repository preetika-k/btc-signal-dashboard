import { useEffect, useRef, useState, useCallback } from 'react';

export function usePriceWebSocket() {
  const [binancePrice, setBinancePrice] = useState(null);
  const [chainlinkPrice, setChainlinkPrice] = useState(null);
  const [priceSource, setPriceSource] = useState(null); // 'polymarket' | 'binance'
  const [lastUpdate, setLastUpdate] = useState(0);
  const [isStale, setIsStale] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const polyWsRef = useRef(null);
  const binanceWsRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const staleTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const binanceReconnectTimerRef = useRef(null);

  // Mark data as fresh on every update
  const markFresh = useCallback(() => {
    const now = Date.now();
    setLastUpdate(now);
    setIsStale(false);
    clearTimeout(staleTimerRef.current);
    staleTimerRef.current = setTimeout(() => {
      setIsStale(true);
      // Auto-reconnect on stale
      connectPolymarket();
      connectBinance();
    }, 3000);
  }, []);

  // ─── Polymarket WebSocket (primary) ───
  function connectPolymarket() {
    // Clean up existing
    if (polyWsRef.current) {
      try { polyWsRef.current.close(); } catch (e) {}
    }
    clearInterval(pingIntervalRef.current);
    clearTimeout(reconnectTimerRef.current);

    console.log('[Price WS] Connecting to Polymarket...');
    const ws = new WebSocket('wss://ws-live-data.polymarket.com');
    polyWsRef.current = ws;

    ws.onopen = () => {
      console.log('[Price WS] Polymarket connected');
      setWsConnected(true);

      // Subscribe to Binance price feed
      ws.send(JSON.stringify({
        action: 'subscribe',
        subscriptions: [{ topic: 'crypto_prices', type: 'update', filters: 'btcusdt' }]
      }));

      // Subscribe to Chainlink price feed
      ws.send(JSON.stringify({
        action: 'subscribe',
        subscriptions: [{ topic: 'crypto_prices_chainlink', type: '*', filters: '{"symbol":"btc/usd"}' }]
      }));

      // PING every 5 seconds
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('PING');
        }
      }, 5000);
    };

    ws.onmessage = (event) => {
      const raw = event.data;
      if (raw === 'PONG') return;

      try {
        const msg = JSON.parse(raw);

        // Try multiple parsing paths for price extraction
        let price = null;

        // Path 1: msg.payload.value
        if (msg?.payload?.value !== undefined) {
          price = parseFloat(msg.payload.value);
        }
        // Path 2: msg.data.price
        if (price === null || isNaN(price)) {
          if (msg?.data?.price !== undefined) {
            price = parseFloat(msg.data.price);
          }
        }
        // Path 3: msg.data.p
        if (price === null || isNaN(price)) {
          if (msg?.data?.p !== undefined) {
            price = parseFloat(msg.data.p);
          }
        }
        // Path 4: msg.data is a number string
        if (price === null || isNaN(price)) {
          if (typeof msg?.data === 'string' || typeof msg?.data === 'number') {
            const p = parseFloat(msg.data);
            if (!isNaN(p) && p > 1000) price = p;
          }
        }
        // Path 5: msg.payload is a number
        if (price === null || isNaN(price)) {
          if (typeof msg?.payload === 'string' || typeof msg?.payload === 'number') {
            const p = parseFloat(msg.payload);
            if (!isNaN(p) && p > 1000) price = p;
          }
        }
        // Path 6: msg.value
        if (price === null || isNaN(price)) {
          if (msg?.value !== undefined) {
            const p = parseFloat(msg.value);
            if (!isNaN(p) && p > 1000) price = p;
          }
        }

        if (price !== null && !isNaN(price) && price > 1000) {
          // Determine which feed this is from
          const topic = msg.topic || msg.channel || '';
          if (topic.includes('chainlink') || topic === 'crypto_prices_chainlink') {
            setChainlinkPrice(price);
          } else {
            setBinancePrice(price);
            setPriceSource('polymarket');
          }
          markFresh();
        }

        // Debug: log first few messages to understand format
        if (!window._polyDebugCount) window._polyDebugCount = 0;
        if (window._polyDebugCount < 10) {
          console.log('[Polymarket msg]', JSON.stringify(msg).slice(0, 300));
          window._polyDebugCount++;
        }
      } catch (e) {
        // Non-JSON, ignore
      }
    };

    ws.onclose = () => {
      console.log('[Price WS] Polymarket disconnected');
      setWsConnected(false);
      clearInterval(pingIntervalRef.current);
      reconnectTimerRef.current = setTimeout(connectPolymarket, 2000);
    };

    ws.onerror = (err) => {
      console.error('[Price WS] Polymarket error');
      try { ws.close(); } catch (e) {}
    };
  }

  // ─── Binance WebSocket (backup) ───
  function connectBinance() {
    if (binanceWsRef.current) {
      try { binanceWsRef.current.close(); } catch (e) {}
    }
    clearTimeout(binanceReconnectTimerRef.current);

    console.log('[Price WS] Connecting to Binance backup...');
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
    binanceWsRef.current = ws;

    ws.onopen = () => {
      console.log('[Price WS] Binance backup connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const price = parseFloat(data.c);
        if (!isNaN(price) && price > 1000) {
          // Only use Binance if Polymarket isn't providing prices
          setBinancePrice(prev => {
            // If no price yet, use Binance
            if (!prev) {
              setPriceSource('binance');
              markFresh();
              return price;
            }
            // If Polymarket is source, don't overwrite
            return prev;
          });

          // Always update if source is binance
          if (!polyWsRef.current || polyWsRef.current.readyState !== WebSocket.OPEN) {
            setBinancePrice(price);
            setPriceSource('binance');
            markFresh();
          }
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      console.log('[Price WS] Binance backup disconnected');
      binanceReconnectTimerRef.current = setTimeout(connectBinance, 5000);
    };

    ws.onerror = () => {
      try { ws.close(); } catch (e) {}
    };
  }

  useEffect(() => {
    connectPolymarket();
    connectBinance();

    return () => {
      clearInterval(pingIntervalRef.current);
      clearTimeout(staleTimerRef.current);
      clearTimeout(reconnectTimerRef.current);
      clearTimeout(binanceReconnectTimerRef.current);
      try { polyWsRef.current?.close(); } catch (e) {}
      try { binanceWsRef.current?.close(); } catch (e) {}
    };
  }, []);

  return {
    binancePrice,
    chainlinkPrice,
    priceSource,
    lastUpdate,
    isStale,
    wsConnected,
  };
}
