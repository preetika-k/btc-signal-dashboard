# Bitcoin Polymarket Signal Dashboard

A real-time trading signal dashboard for Polymarket's 15-minute Bitcoin prediction markets. Combines live WebSocket price feeds, technical analysis, and AI-powered confirmation to identify high-conviction trade setups.

## What It Does

Polymarket runs short-window prediction markets where users bet on whether Bitcoin's price will be higher or lower at the end of a fixed time interval. This dashboard helps traders make more informed decisions by analyzing live market data in real time and only recommending trades when multiple signals align.

## Features

- **Live Price Feed** — Connects directly to Polymarket's RTDS WebSocket and Binance streams for tick-by-tick price updates
- **TradingView Chart** — Embedded advanced chart with built-in RSI, MACD, and Bollinger Band indicators
- **10-Signal Prediction Engine** — Scores market conditions across price velocity, order flow, volume, momentum, and technical indicators
- **Three-Tier Confidence System** — Classifies setups as GREEN (trade), YELLOW (skip), or RED (no edge) based on signal agreement
- **AI Confirmation Layer** — Uses Claude API to validate high-conviction signals and catch hidden risks
- **News Sentiment Analyzer** — Paste Telegram or news headlines for real-time sentiment scoring
- **Accuracy Tracking** — Logs every prediction and tracks hit rate by confidence tier

## Tech Stack

- **Frontend:** React, Vite, TradingView Widget, Recharts
- **Backend:** Node.js, Express
- **Real-Time Data:** Polymarket RTDS WebSocket, Binance WebSocket
- **AI:** Anthropic Claude API
- **Styling:** Custom dark theme with Inter font

## Setup

1. Clone the repo