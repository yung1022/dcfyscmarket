const DEFAULT_STOCKS = [
  {
    symbol: 'AAPL',
    company: 'Apple',
    price: 214.86,
    trend: 0.0007,
    volatility: 0.014,
    volume: '52.1M',
    marketCap: '3.2T',
    yearRange: '164.08 - 237.49',
    dayRange: '212.10 - 216.25',
    history: [191.2, 193.8, 196.5, 195.1, 201.3, 205.2, 208.8, 210.4, 214.1, 214.86]
  },
  {
    symbol: 'MSFT',
    company: 'Microsoft',
    price: 447.12,
    trend: 0.0009,
    volatility: 0.012,
    volume: '28.6M',
    marketCap: '3.3T',
    yearRange: '349.67 - 468.35',
    dayRange: '440.15 - 449.80',
    history: [388.7, 390.2, 392.1, 396.7, 401.5, 410.1, 415.8, 418.4, 422.9, 426.8, 439.2, 447.12]
  },
  {
    symbol: 'NVDA',
    company: 'NVIDIA',
    price: 136.74,
    trend: 0.0011,
    volatility: 0.018,
    volume: '43.9M',
    marketCap: '3.4T',
    yearRange: '78.62 - 140.76',
    dayRange: '134.29 - 138.18',
    history: [118.2, 120.1, 124.6, 127.3, 129.7, 131.5, 129.8, 130.6, 133.9, 135.2, 137.4, 136.74]
  },
  {
    symbol: 'AMZN',
    company: 'Amazon',
    price: 184.22,
    trend: 0.0005,
    volatility: 0.011,
    volume: '24.8M',
    marketCap: '1.9T',
    yearRange: '145.86 - 201.20',
    dayRange: '181.55 - 185.90',
    history: [172.1, 171.8, 174.2, 176.6, 178.3, 181.2, 182.1, 179.8, 181.4, 183.7, 185.1, 184.22]
  },
  {
    symbol: 'TSLA',
    company: 'Tesla',
    price: 244.98,
    trend: -0.0004,
    volatility: 0.022,
    volume: '62.4M',
    marketCap: '786B',
    yearRange: '138.80 - 299.29',
    dayRange: '241.50 - 249.32',
    history: [266.4, 268.2, 265.7, 262.3, 257.8, 255.2, 251.9, 248.6, 246.5, 249.2, 245.7, 244.98]
  }
];

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const ACTIVITY_MIN = -1;
const ACTIVITY_MAX = 1;

function normalizeActivity(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, ACTIVITY_MIN, ACTIVITY_MAX) : 0;
}

// Tick history sampling: charts at 1, 10, 50 and 100 tick intervals.
const HISTORY_CAP = 200;
const SAMPLE_INTERVALS = [
  { key: 'history', every: 1, cap: HISTORY_CAP },
  { key: 'history10', every: 10, cap: 120 },
  { key: 'history50', every: 50, cap: 120 },
  { key: 'history100', every: 100, cap: 120 }
];

function initializeTickData(stock) {
  const base = Array.isArray(stock.history)
    ? stock.history.map(Number).filter(Number.isFinite)
    : [];
  if (!base.length && Number.isFinite(Number(stock.price))) base.push(Number(stock.price));
  const tickCount = Number.isFinite(Number(stock.tickCount)) ? Number(stock.tickCount) : Math.max(0, base.length - 1);

  const result = { history: base, tickCount, sampled: {} };
  for (const { key } of SAMPLE_INTERVALS.slice(1)) {
    result.sampled[key] = Array.isArray(stock[key])
      ? stock[key].map(Number).filter(Number.isFinite)
      : [];
  }
  return result;
}

function buildHistoryUpdate(stock, nextPrice) {
  const previousPrice = Number(stock.price) || 0;
  const tickData = initializeTickData(stock);
  const tickCount = tickData.tickCount + 1;

  const update = { price: nextPrice, tickCount };

  for (const { key, every, cap } of SAMPLE_INTERVALS) {
    const series = key === 'history' ? tickData.history : tickData.sampled[key];
    const shouldRecord = every === 1 || tickCount % every === 0 || tickCount === 1;
    if (!shouldRecord) {
      if (key !== 'history') update[key] = series.slice(-cap);
      continue;
    }
    const next = [...series, nextPrice];
    if (next.length > cap) next.splice(0, next.length - cap);
    update[key] = next.map((value) => Number(value.toFixed(4)));
  }

  const history = update.history;
  const previous = history.length > 1 ? history[history.length - 2] : nextPrice;
  update.change = previous > 0 ? Number((((nextPrice - previous) / previous) * 100).toFixed(2)) : 0;

  const recent = history.slice(-12);
  update.dayRange = `${Math.min(...recent).toFixed(4)} - ${Math.max(...recent).toFixed(4)}`;

  if (previousPrice > 0) {
    const ratio = nextPrice / previousPrice;
    for (const field of ['marketCap', 'value']) {
      const existingValue = Number(stock[field]);
      if (Number.isFinite(existingValue)) update[field] = Number((existingValue * ratio).toFixed(4));
    }
  }

  return update;
}

function computeTickPrice(stock) {
  const activity = normalizeActivity(stock.stockActivity);
  const drift = Number.isFinite(Number(stock.trend)) ? Number(stock.trend) : 0;
  const volatility = Number.isFinite(Number(stock.volatility)) ? Number(stock.volatility) : 0.012;
  const noise = randomBetween(-volatility, volatility);
  const influence = clamp(Math.abs(activity) * 0.02, 0, 0.2);
  const direction = activity >= 0 ? 1 : -1;
  return clamp(stock.price * (1 + drift + noise + direction * influence), 0.0001, 10000);
}

function ensureState() {
  if (!globalThis.__dcfyscmarketState) {
    globalThis.__dcfyscmarketState = {
      stocks: Object.fromEntries(DEFAULT_STOCKS.map((stock) => [stock.symbol, { ...stock }])),
      users: {
        demo: {
          cash: 0,
          holdings: {}
        }
      },
      lastUpdated: new Date().toISOString()
    };
  }

  return globalThis.__dcfyscmarketState;
}

export function getMarketSnapshot() {
  const state = ensureState();
  const stocks = Object.values(state.stocks).map((stock) => {
    const previous = stock.history[stock.history.length - 2] || stock.price;
    const change = Number((((stock.price - previous) / previous) * 100).toFixed(2));

    return {
      symbol: stock.symbol,
      company: stock.company,
      price: Number(stock.price.toFixed(2)),
      change,
      volume: stock.volume,
      marketCap: stock.marketCap,
      yearRange: stock.yearRange,
      dayRange: stock.dayRange,
      stockActivity: Number(normalizeActivity(stock.stockActivity).toFixed(6)),
      sentiment: stock.price >= previous ? 'Bullish' : 'Bearish',
      history: stock.history,
      history10: stock.history10 || [],
      history50: stock.history50 || [],
      history100: stock.history100 || [],
      updatedAt: state.lastUpdated
    };
  });

  return {
    stocks,
    updatedAt: state.lastUpdated,
    marketSummary: {
      dow: '42,716.18',
      dowDelta: '+0.82%',
      nasdaq: '18,694.42',
      nasdaqDelta: '+1.14%',
      sp: '5,782.94',
      spDelta: '+0.67%',
      sentiment: 'Bullish',
      sentimentText: 'Risk appetite remains healthy'
    }
  };
}

export function tickMarket() {
  const state = ensureState();

  Object.values(state.stocks).forEach((stock) => {
    // Activity decays by 5-15% each tick, and drives the price direction.
    const decayRate = randomBetween(0.05, 0.15);
    const nextPrice = computeTickPrice(stock);

    stock.price = Number(nextPrice.toFixed(4));
    stock.stockActivity = normalizeActivity(stock.stockActivity) * (1 - decayRate);

    const updates = buildHistoryUpdate(stock, stock.price);
    Object.assign(stock, updates);

    if (typeof stock.stockActivity !== 'number') {
      stock.stockActivity = 0;
    }
  });

  state.lastUpdated = new Date().toISOString();
  return getMarketSnapshot();
}

export function getPortfolio(userId = 'demo') {
  const state = ensureState();
  const user = state.users[userId] || { cash: 0, holdings: {} };
  const snapshot = getMarketSnapshot();

  let portfolioValue = user.cash;
  const holdings = Object.entries(user.holdings).map(([symbol, shares]) => {
    const stock = snapshot.stocks.find((item) => item.symbol === symbol);
    const currentPrice = stock ? stock.price : 0;
    const value = shares * currentPrice;
    portfolioValue += value;

    return {
      symbol,
      shares,
      price: currentPrice,
      value,
      change: stock ? stock.change : 0
    };
  });

  return {
    userId,
    cash: Number(user.cash.toFixed(2)),
    portfolioValue: Number(portfolioValue.toFixed(2)),
    holdings,
    updatedAt: state.lastUpdated
  };
}

export function placeTrade({ userId = 'demo', symbol, action, quantity }) {
  const state = ensureState();
  const safeQty = Number(quantity);

  if (!symbol || !['buy', 'sell'].includes(action) || !Number.isFinite(safeQty) || safeQty <= 0) {
    return {
      ok: false,
      message: 'Invalid trade request.'
    };
  }

  if (!state.users[userId]) {
    state.users[userId] = { cash: 0, holdings: {} };
  }

  const user = state.users[userId];
  const stock = state.stocks[symbol];

  if (!stock) {
    return {
      ok: false,
      message: 'Symbol not found.'
    };
  }

  const price = stock.price;
  const total = price * safeQty;

  if (action === 'buy') {
    if (user.cash < total) {
      return {
        ok: false,
        message: 'Not enough cash to buy these shares.'
      };
    }

    user.cash = Number((user.cash - total).toFixed(2));
    user.holdings[symbol] = Number(((user.holdings[symbol] || 0) + safeQty).toFixed(2));
  }

  if (action === 'sell') {
    const owned = Number(user.holdings[symbol] || 0);

    if (owned < safeQty) {
      return {
        ok: false,
        message: 'Not enough shares to sell.'
      };
    }

    user.cash = Number((user.cash + total).toFixed(2));
    user.holdings[symbol] = Number((owned - safeQty).toFixed(2));

    if (user.holdings[symbol] <= 0) {
      delete user.holdings[symbol];
    }
  }

  // Trades move activity, not the price directly.
  const impact = clamp(safeQty * 0.001, 0, 0.05) * (action === 'buy' ? 1 : -1);
  stock.stockActivity = normalizeActivity((stock.stockActivity || 0) + impact);

  state.lastUpdated = new Date().toISOString();

  return {
    ok: true,
    action,
    symbol,
    quantity: safeQty,
    price,
    total,
    cash: Number(user.cash.toFixed(2)),
    portfolio: getPortfolio(userId)
  };
}

export function seedIfNeeded() {
  ensureState();
  return getMarketSnapshot();
}

export default {
  ensureState,
  getMarketSnapshot,
  tickMarket,
  getPortfolio,
  placeTrade,
  seedIfNeeded
};

