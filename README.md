# dcfyscmarket

A stock-market dashboard designed for Vercel.

## Vercel structure

- `index.html` — dashboard UI
- `styles.css` — market-dashboard styling
- `script.js` — fetches market data and sends buy/sell requests
- `api/market-updater.js` — updates prices with noise and drift
- `api/trade.js` — executes buy/sell requests
- `api/portfolio.js` — returns the current portfolio state
- `api/lib/market.js` — shared market engine and portfolio logic
- `vercel.json` — includes the cron schedule for live updates

## Local development

```bash
npm install
npm run dev
```

Then open the local Vercel URL.

## Vercel cron job

The project includes a scheduled job in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/market-updater",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

This calls the market updater each minute.

## Market engine

The stock engine uses:
- drift per stock
- random volatility/noise
- price history tracking
- portfolio cash and holdings

## Buy / sell API

Example request:

```bash
curl -X POST http://localhost:3000/api/trade \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","symbol":"AAPL","action":"buy","quantity":3}'
```

Example response:

```json
{
  "ok": true,
  "action": "buy",
  "symbol": "AAPL",
  "quantity": 3,
  "price": 214.86,
  "total": 644.58,
  "cash": 99355.42,
  "portfolio": {
    "userId": "demo",
    "cash": 99355.42,
    "portfolioValue": 100000,
    "holdings": []
  }
}
```

Note: this version keeps market state in server memory for a simple demo and is suitable for Vercel prototyping. For production persistence, connect the API to Supabase or Firebase.

