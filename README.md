# dcfyscmarket

A stock-market dashboard designed for Vercel.

## Vercel structure

- `index.html` — dashboard UI
- `styles.css` — market-dashboard styling
- `script.js` — fetches market data and sends buy/sell requests
- `api/market-updater.js` — returns or advances simulated prices
- `api/trade.js` — executes authenticated simulated trades
- `api/portfolio.js` — returns the signed-in user's portfolio
- `api/auth/session.js` — returns the signed-in Discord profile
- `api/lib/market.js` — shared market engine and portfolio logic
- `vercel.json` — includes the cron schedule for live updates

## Local development

```bash
npm install
npm run dev
```

Then open the local Vercel URL.

## API workflow

- `GET /api/market-updater` returns the current market snapshot.
- `POST /api/market-updater` advances the simulated market by one tick.
- `GET /api/portfolio` returns the current user's cash and holdings. It requires the Discord login cookie.
- `POST /api/trade` buys or sells simulated shares. It requires the Discord login cookie and accepts `{ "symbol": "AAPL", "action": "buy", "quantity": 3 }`.
- The dashboard reads the snapshot at startup, advances prices every 15 seconds, and refreshes a signed-in portfolio every 30 seconds.

The current quote source is a simulator in `api/lib/market.js`; it does not receive exchange prices. Market and portfolio state is stored in server memory, so it can reset or diverge between serverless invocations. Discord profiles are upserted to Firebase, but simulated holdings and trades are not yet persisted there.

## Connecting real market data

To use actual quotes, connect a market-data provider (for example, Finnhub, Twelve Data, or Polygon) from a server API route:

1. Choose a provider and confirm its plan permits your intended display, refresh rate, and user count.
2. Add its API key to the Vercel project as an environment variable. Do not put the key in `index.html` or `script.js`.
3. Replace the simulated quote generation in `api/lib/market.js` with a server-side fetch in `api/market-updater.js`. Normalize the provider response into the existing stock fields: `symbol`, `price`, `change`, `volume`, `dayRange`, `yearRange`, `history`, and `updatedAt`.
4. Persist normalized quotes and user portfolios/trades in Firebase (using the Admin SDK from API routes), rather than relying on `globalThis` memory.
5. Have the browser continue reading only your own `/api/market-updater` endpoint. Add a scheduled updater or provider streaming service if quotes must update when no browser is open.

The current buy/sell endpoints only simulate trades. Real-money orders require a broker API, explicit user authorization, and additional security and compliance work; a quote-data API alone cannot execute them.

Treat the simulator as a development demo, not as investment data or a brokerage service.
