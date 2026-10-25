# dcfyscmarket

A stock-market dashboard designed for Vercel.

## Vercel structure

- `index.html` — dashboard UI
- `styles.css` — market-dashboard styling
- `script.js` — fetches market data and sends buy/sell requests
- `api/market-updater.js` — reads quotes or advances the Firebase-backed market on POST
- `api/add-stock.js` — adds a stock with a company name
- `api/trade.js` — executes authenticated Firebase-backed trades
- `api/portfolio.js` — returns the signed-in user's portfolio
- `api/auth/session.js` — returns the signed-in Discord profile
- `api/lib/realtime-db.js` — Firebase Realtime Database quote and portfolio storage
- `vercel.json` — includes the cron schedule for live updates

## Local development

```bash
npm install
npm run dev
```

Then open the local Vercel URL.

## API workflow

- `GET /api/market-updater` reads quotes from Realtime Database path `/stocks`.
- `POST /api/market-updater` advances every valid Firebase stock price by one market tick and updates its history. GET never advances prices.
- `POST /api/add-stock` accepts `{ "company": "Example Company" }`, generates a unique symbol, and defaults `price`, `marketCap`, and `value` to `0.01`.
- `GET /api/portfolio` reads the signed-in user's cash and holdings from `users/{discordUserId}`. It requires the Discord login cookie.
- `POST /api/trade` buys or sells shares using the Firebase quote, transactionally updates cash/holdings, and moves the stock price in the trade direction. It requires the Discord login cookie and accepts `{ "symbol": "AAPL", "action": "buy", "quantity": 3 }`.
- `POST /api/cash` increments the signed-in user's cash balance by a positive `amount`, up to `$1,000,000,000` per request. It requires the Discord login cookie and accepts `{ "amount": 500 }`.
- The dashboard reads quotes at startup and every 15 seconds, and refreshes a signed-in portfolio every 30 seconds. Use the “Tick market” button to send the POST that advances prices.

## Firebase setup

Configure these server-side environment variables in Vercel (and locally for `vercel dev`):

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (preserve newlines or use `\\n` escapes)
- `FIREBASE_DATABASE_URL` is required and must be the URL shown for your Firebase Realtime Database.

Realtime Database data layout:

- `/stocks/{SYMBOL}` — quote object with `symbol`, `company`, `price`, `change`, `volume`, `marketCap`, `dayRange`, `yearRange`, `history`, and `updatedAt`.
- `/market/summary` — index summary fields such as `dow`, `dowDelta`, `nasdaq`, `nasdaqDelta`, `sp`, `spDelta`, `sentiment`, and `sentimentText`.
- `/users/{discordUserId}` — Discord profile plus `cash` and `holdings`. New users start with `$0` cash.

All server-side Firebase operations use Realtime Database; Firestore is not used. Missing user records are initialized by the portfolio lookup, the missing `/market/summary` node is created on the first market read, and a missing valid ticker lookup or trade creates `/stocks/{SYMBOL}` with the symbol as its company name and `$0.01` defaults for price, market cap, and value.

Market ticks and trades update quote objects in Realtime Database, but the app does not fetch live exchange prices. Populate `/stocks` using Firebase Console, `POST /api/add-stock`, or a server-side integration with a market-data provider. Keep any provider key in server environment variables, not in `index.html` or `script.js`. The market endpoint returns `503` when Realtime Database is not configured or `/stocks` has no valid quote objects; it does not fall back to in-memory state.

Trades are simulated portfolio transactions only. Real-money orders require a broker API, explicit user authorization, and additional security and compliance work; a quote-data API alone cannot execute them.

The app requires Firebase configuration and seeded quote documents to display market data or make trades.
