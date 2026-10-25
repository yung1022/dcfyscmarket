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
      sentiment: stock.price >= previous ? 'Bullish' : 'Bearish',
      history: stock.history,
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
    const drift = stock.trend;
    const noise = randomBetween(-stock.volatility, stock.volatility);
    const nextPrice = clamp(stock.price * (1 + drift + noise), 10, 10000);

    stock.price = Number(nextPrice.toFixed(2));
    stock.history.push(stock.price);

    if (stock.history.length > 50) {
      stock.history.shift();
    }

    const dayLow = Math.min(...stock.history.slice(-12));
    const dayHigh = Math.max(...stock.history.slice(-12));
    stock.dayRange = `${dayLow.toFixed(2)} - ${dayHigh.toFixed(2)}`;
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

