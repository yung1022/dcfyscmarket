import admin from 'firebase-admin';

function getFirebaseConfig() {
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey,
    databaseURL: process.env.FIREBASE_DATABASE_URL || process.env.DATABASE_URL
  };
}

function getRealtimeDb() {
  if (!admin.apps.length) {
    const config = getFirebaseConfig();
    if (!config.projectId || !config.clientEmail || !config.privateKey || !config.databaseURL) {
      throw new Error('Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, and FIREBASE_DATABASE_URL.');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey
      }),
      databaseURL: config.databaseURL
    });
  }

  return admin.database();
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function defaultStock(symbol, updatedAt = new Date().toISOString()) {
  return {
    symbol,
    company: symbol,
    price: 0.01,
    change: 0,
    volume: '0',
    marketCap: 0.01,
    value: 0.01,
    dayRange: '0.01 - 0.01',
    yearRange: '0.01 - 0.01',
    history: [0.01],
    tickCount: 0,
    stockActivity: 0,
    volumeShares: 0,
    createdAt: updatedAt,
    updatedAt
  };
}

// Trade activity is stored on the stock (range roughly -1 .. 1) and drives the
// price direction. Positive activity pushes the price up, negative pushes it down.
const ACTIVITY_MIN = -1;
const ACTIVITY_MAX = 1;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeActivity(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, ACTIVITY_MIN, ACTIVITY_MAX) : 0;
}

// Standard normal sample (Box-Muller) for the OU diffusion term.
function gaussianNoise() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Parse market cap / volume labels like "3.2T", "786B", "52.1M" or plain numbers.
function parseMarketCap(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const match = String(value ?? '').match(/^([0-9.]+)\s*([KMBT])?$/i);
  if (!match) return 0;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(match[2] || '').toUpperCase()] || 1;
  return Number(match[1]) * multiplier;
}

// Ornstein-Uhlenbeck process: dA = theta * (mu - A) dt + sigma dW.
// The stock's activity is the mean-reverting state, and the stock's
// volatility is the diffusion (shock) term. One tick = one time step.
const OU_MEAN_REVERSION = 0.12; // theta: pull back toward the long-run mean
// Nonlinear reversion: pumped/dumped activity (|A| near 1) reverts much faster
// than quiet activity, so a channel cannot be held at an extreme by repeated
// trades. Effective theta = OU_MEAN_REVERSION * (1 + OU_PUMP_REVERSION * A^2).
const OU_PUMP_REVERSION = 4;
const OU_LONG_RUN_MEAN = 0;     // mu: activity reverts to neutral
const OU_DT = 1;                // time step per tick
// stock.volatility is a *price* volatility (~0.006-0.022 per tick). The OU state
// (activity) lives on a -1..1 scale, so the diffusion term must be rescaled into
// activity units; using the raw price volatility left sigma ~0.012, which with
// theta=0.12 pins the activity at ~0 every tick.
const OU_VOLATILITY_SCALE = 25; // maps price volatility onto activity units

function ouStep(activity, volatility) {
  // Stocks added via /api/add-stock have no `volatility` field; fall back to the
  // same default computeTickPrice uses, otherwise NaN would poison the whole
  // step and normalizeActivity would snap the activity back to 0 every tick.
  const rawVolatility = Number(volatility);
  const sigma = clamp(Number.isFinite(rawVolatility) ? rawVolatility : 0.006, 0.0001, 1) * OU_VOLATILITY_SCALE;
  // Strengthen reversion when the state is far from the mean so repeated buys
  // or sells cannot pin the activity (and therefore the price drift) at a peak.
  const theta = OU_MEAN_REVERSION * (1 + OU_PUMP_REVERSION * activity * activity);
  const drift = theta * (OU_LONG_RUN_MEAN - activity) * OU_DT;
  const diffusion = sigma * Math.sqrt(OU_DT) * gaussianNoise();
  return normalizeActivity(activity + drift + diffusion);
}

// Trade impact for a single order: the bigger the order relative to the
// stock's liquidity depth, the harder it moves the price — and the trade
// executes AT the impacted price, so the pumper pays for the pump.
function computeTradeImpact(stock, sharesToTrade) {
  const price = Number(stock.price) || 0;
  const marketCap = parseMarketCap(stock.marketCap) || price * 1e6;
  // Liquidity depth: 0.05% of market cap worth of shares absorbs a 10% move.
  const liquidityShares = Math.max(marketCap / Math.max(price, 0.0001) * 0.0005, 1000);
  return clamp(sharesToTrade / liquidityShares * 0.1, 0, 0.1);
}

const HISTORY_CAP = 200;
const SAMPLE_INTERVALS = [
  { key: 'history', every: 1, cap: 200 },
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
    let series = Array.isArray(stock[key]) ? stock[key].map(Number).filter(Number.isFinite) : [];
    if (!series.length) {
      // Backfill from the tick history when the interval series is missing.
      series = base.filter((_, index) => (tickCount - (base.length - 1 - index)) % 1 === 0 && index === base.length - 1);
    }
    result.sampled[key] = series;
  }
  return result;
}

function buildHistoryUpdate(stock, nextPrice, updatedAt) {
  const previousPrice = Number(stock.price) || 0;
  const tickData = initializeTickData(stock);
  const tickCount = tickData.tickCount + 1;

  const update = {
    price: nextPrice,
    tickCount,
    updatedAt
  };

  for (const { key, every, cap } of SAMPLE_INTERVALS) {
    const series = key === 'history' ? tickData.history : tickData.sampled[key];
    // Record a point on this interval only when the tick counter hits a multiple.
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

// Estimate share volume traded this tick: scales with price movement and
// absolute activity, with a baseline churn so quiet stocks still trade.
function computeTickVolume(stock, nextPrice) {
  const previousPrice = Number(stock.price) || nextPrice;
  const volatility = Number.isFinite(Number(stock.volatility)) ? Number(stock.volatility) : 0.006;
  const activity = Math.abs(normalizeActivity(stock.stockActivity));
  const priceMove = previousPrice > 0 ? Math.abs(nextPrice - previousPrice) / previousPrice : 0;
  const baselineShares = clamp((Number(stock.marketCap) || 0) / Math.max(nextPrice, 0.0001) * 0.0002, 100, 50000000);
  const shares = baselineShares * (1 + priceMove / Math.max(volatility, 0.0001) * 0.5 + activity * 3 + randomBetween(0, 0.25));
  return Math.round(clamp(shares, 0, 1e12));
}

function formatVolume(shares) {
  const value = Number(shares) || 0;
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return String(Math.round(value));
}

async function ensureUser(discordUserId, profile = {}) {
  const now = new Date().toISOString();
  const userRef = getRealtimeDb().ref(`users/${discordUserId}`);
  const result = await userRef.transaction((current) => {
    const user = isRecord(current) ? current : {};
    return {
      ...user,
      ...profile,
      discordUserId,
      cash: Number.isFinite(Number(user.cash)) ? Number(user.cash) : 0,
      holdings: isRecord(user.holdings) ? user.holdings : {},
      createdAt: user.createdAt || now,
      updatedAt: now
    };
  });
  return result.snapshot.val();
}

export async function upsertDiscordUser(discordUserId, discordUsername, profile = {}) {
  const data = await ensureUser(discordUserId, { ...profile, discordUsername });
  return { mode: 'firebase-admin-realtime-database', data };
}

export async function saveStockToDb(symbol, stock) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,16}$/.test(normalizedSymbol)) throw new Error('Invalid stock symbol.');

  const payload = {
    ...stock,
    symbol: normalizedSymbol,
    updatedAt: stock.updatedAt || new Date().toISOString()
  };
  await getRealtimeDb().ref(`stocks/${normalizedSymbol}`).set(payload);
  return { mode: 'firebase-admin-realtime-database', data: payload };
}

export async function createStockForCompany(company, stock) {
  const baseSymbol = String(company)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 10);
  if (!baseSymbol) throw new Error('Company name must include letters or numbers.');

  const now = new Date().toISOString();
  const stocksRef = getRealtimeDb().ref('stocks');
  let createdSymbol = '';
  const result = await stocksRef.transaction((current) => {
    const stocks = isRecord(current) ? { ...current } : {};
    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const suffixText = suffix ? String(suffix) : '';
      const symbol = `${baseSymbol.slice(0, 10 - suffixText.length)}${suffixText}`;
      if (stocks[symbol]) continue;

      createdSymbol = symbol;
      stocks[symbol] = {
        ...stock,
        symbol,
        company: String(company).trim(),
        createdAt: now,
        updatedAt: now
      };
      return stocks;
    }
    return;
  });

  if (!result.committed || !createdSymbol) throw new Error('Could not generate a unique symbol for this company.');
  return {
    mode: 'firebase-admin-realtime-database',
    data: result.snapshot.child(createdSymbol).val()
  };
}

export async function getStockFromDb(symbol) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,16}$/.test(normalizedSymbol)) return null;

  const stockRef = getRealtimeDb().ref(`stocks/${normalizedSymbol}`);
  const now = new Date().toISOString();
  const result = await stockRef.transaction((current) => current || defaultStock(normalizedSymbol, now));
  return result.snapshot.val();
}

function computeMarketTotalValue(stocks) {
  const total = stocks.reduce((sum, stock) => {
    const marketCap = Number(stock.marketCap);
    const value = Number(stock.value);
    const fallback = Number(stock.price) || 0;
    const contribution = Number.isFinite(marketCap) && marketCap > 0 ? marketCap : (Number.isFinite(value) && value > 0 ? value : fallback);
    return sum + contribution;
  }, 0);
  return Number(total.toFixed(2));
}

export async function getMarketDataFromDb() {
  const db = getRealtimeDb();
  const [stocksSnapshot, summarySnapshot] = await Promise.all([
    db.ref('stocks').once('value'),
    db.ref('market/summary').once('value')
  ]);
  const stocksValue = stocksSnapshot.val();
  const stocks = Object.entries(isRecord(stocksValue) ? stocksValue : {})
    .map(([symbol, stock]) => ({ ...stock, symbol: stock.symbol || symbol }))
    .filter((stock) => stock.symbol && Number.isFinite(Number(stock.price)) && Number(stock.price) > 0);

  if (!stocks.length && stocksSnapshot.exists()) {
    const entries = Object.entries(stocksValue).length;
    throw new Error(
      `/stocks contains ${entries} entries but none has a valid price. ` +
      'Each quote needs a positive numeric `price` and a `symbol` (the object key is used when `symbol` is absent).'
    );
  }

  const summaryRef = db.ref('market/summary');
  const now = new Date().toISOString();
  const summaryResult = summarySnapshot.exists()
    ? null
    : await summaryRef.transaction((current) => current || { updatedAt: now });
  const marketSummary = {
    ...(summarySnapshot.exists() ? summarySnapshot.val() : summaryResult.snapshot.val()),
    marketTotalValue: computeMarketTotalValue(stocks)
  };

  return {
    stocks,
    updatedAt: marketSummary.updatedAt || null,
    marketSummary
  };
}

function computeTickPrice(stock) {
  const activity = normalizeActivity(stock.stockActivity);
  const drift = Number.isFinite(Number(stock.trend)) ? Number(stock.trend) : 0;
  const volatility = Number.isFinite(Number(stock.volatility)) ? Number(stock.volatility) : 0.006;
  // Stock activity is the volatility: price shocks scale with |activity|.
  const noise = gaussianNoise() * volatility * (0.25 + Math.abs(activity));
  // Activity scales VOLATILITY only, never a deterministic direction. A
  // directional drift proportional to activity would be a free option: small
  // orders pay negligible slippage but still add activity, and the holder
  // then collects the guaranteed drift on later ticks. Noise is mean-zero,
  // so the price is a martingale and pump-and-dump round trips can only
  // lose the slippage paid on entry and exit.
  return clamp(stock.price * (1 + drift + noise), 0.0001, 10000);
}

export async function tickMarketInDb() {
  const db = getRealtimeDb();
  const stocksRef = db.ref('stocks');
  const updatedAt = new Date().toISOString();

  // Explicit server read instead of an RTDB transaction. Transactions on a cold
  // serverless instance can see a null local value and abort even when /stocks
  // has data, which made POST fail with "No stocks found" while GET succeeded.
  const snapshot = await stocksRef.get();
  if (!snapshot.exists()) {
    throw new Error('No stocks found in Firebase Realtime Database at /stocks.');
  }
  const current = snapshot.val();
  if (!isRecord(current) || !Object.keys(current).length) {
    throw new Error('No stocks found in Firebase Realtime Database at /stocks.');
  }

  const updates = {};
  Object.entries(current).forEach(([symbol, stockValue]) => {
    if (!isRecord(stockValue)) return;
    const stock = { ...stockValue, symbol: stockValue.symbol || symbol };
    const currentPrice = Number(stock.price);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;

    // Trade impact and settlement happen in placeTradeInDb: orders execute at
    // the post-impact price, so pump-and-dump round trips always cost more in
    // slippage than they gain in drift.

    // Ornstein-Uhlenbeck tick: activity mean-reverts and is shocked by the
    // stock's volatility, then drives the price direction and magnitude.
    const nextPrice = computeTickPrice(stock);
    const decayedActivity = ouStep(normalizeActivity(stock.stockActivity), stock.volatility);
    const tickVolume = computeTickVolume(stock, nextPrice);
    // Seed the raw share count from a label like "52.1M" if it was never numeric.
    let previousShares = Number(stock.volumeShares);
    if (!Number.isFinite(previousShares)) previousShares = parseMarketCap(stock.volume);
    const totalVolume = Math.round((Number.isFinite(previousShares) ? previousShares : 0) + tickVolume);
    updates[`stocks/${symbol}`] = {
      ...stock,
      ...buildHistoryUpdate(stock, nextPrice, updatedAt),
      volumeShares: totalVolume,
      volume: formatVolume(totalVolume),
      stockActivity: Number(clamp(decayedActivity, ACTIVITY_MIN, ACTIVITY_MAX).toFixed(6))
    };
  });

  if (!Object.keys(updates).length) {
    throw new Error('/stocks contains entries but none has a valid positive numeric `price` to tick.');
  }

  // Atomic multi-path write of every ticked stock plus the summary timestamp.
  await db.ref().update({ ...updates, 'market/summary/updatedAt': updatedAt });
  return getMarketDataFromDb();
}

export async function getPortfolioFromDb(discordUserId) {
  const user = await ensureUser(discordUserId);
  const stocksSnapshot = await getRealtimeDb().ref('stocks').once('value');
  const stocksValue = stocksSnapshot.val();
  const stocks = isRecord(stocksValue) ? stocksValue : {};
  const holdings = isRecord(user.holdings) ? user.holdings : {};
  const positions = Object.entries(holdings).map(([symbol, rawShares]) => {
    const shares = Number(rawShares) || 0;
    const stock = stocks[symbol];
    const price = Number(stock?.price) || 0;
    return {
      symbol,
      shares,
      price,
      value: Number((shares * price).toFixed(4)),
      change: Number(stock?.change) || 0
    };
  });

  const cash = Number.isFinite(Number(user.cash)) ? Number(user.cash) : 0;
  return {
    userId: discordUserId,
    cash: Number(cash.toFixed(4)),
    portfolioValue: Number((cash + positions.reduce((sum, position) => sum + position.value, 0)).toFixed(4)),
    holdings: positions,
    updatedAt: user.updatedAt
  };
}

export async function addCashToDb({ discordUserId, discordUsername, amount }) {
  const cashToAdd = Number(amount);
  if (!Number.isFinite(cashToAdd) || cashToAdd <= -10000 || cashToAdd > 1000000000) {
    throw new Error('Cash increment must be greater than 0 and no more than 1,000,000,000.');
  }

  const now = new Date().toISOString();
  const userRef = getRealtimeDb().ref(`users/${discordUserId}`);
  let resultData;
  const result = await userRef.transaction((current) => {
    const user = isRecord(current) ? current : {};
    const currentCash = Number.isFinite(Number(user.cash)) ? Number(user.cash) : 0;
    const updatedCash = Number((currentCash + cashToAdd).toFixed(2));
    resultData = { discordUserId, previousCash: currentCash, added: cashToAdd, cash: updatedCash };
    return {
      ...user,
      discordUserId,
      ...(discordUsername ? { discordUsername } : {}),
      cash: updatedCash,
      holdings: isRecord(user.holdings) ? user.holdings : {},
      createdAt: user.createdAt || now,
      updatedAt: now
    };
  });

  if (!result.committed) throw new Error('Could not update cash balance.');
  return resultData;
}

export async function placeTradeInDb({ discordUserId, symbol, action, quantity }) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const sharesToTrade = Number(quantity);
  if (!/^[A-Z0-9]{1,16}$/.test(normalizedSymbol) || !['buy', 'sell'].includes(action) || !Number.isInteger(sharesToTrade) || sharesToTrade <= 0) {
    return { ok: false, message: 'Enter a valid symbol and whole-share quantity.' };
  }

  await ensureUser(discordUserId);
  await getStockFromDb(normalizedSymbol);
  const db = getRealtimeDb();
  const rootRef = db.ref();
  const now = new Date().toISOString();
  let failure = 'Trade could not be committed.';
  let tradeResult;

  // Explicit server read first. The transaction handler below can be invoked with
  // a null/stale value on its first speculative run; falling back to this snapshot
  // prevents a false "Not enough cash" failure from aborting a valid trade.
  const preRead = await rootRef.get();
  const preReadRoot = isRecord(preRead.val()) ? preRead.val() : {};

  const result = await rootRef.transaction((current) => {
    const root = isRecord(current) ? current : preReadRoot;
    const stocks = isRecord(root.stocks) ? { ...root.stocks } : {};
    const users = isRecord(root.users) ? { ...root.users } : {};
    const stock = isRecord(stocks[normalizedSymbol])
      ? stocks[normalizedSymbol]
      : defaultStock(normalizedSymbol, now);
    const user = isRecord(users[discordUserId]) ? users[discordUserId] : {};
    const price = Number(stock.price);
    const cash = Number.isFinite(Number(user.cash)) ? Number(user.cash) : 0;
    const holdings = isRecord(user.holdings) ? { ...user.holdings } : {};
    const ownedShares = Number(holdings[normalizedSymbol]) || 0;

    if (!Number.isFinite(price) || price <= 0) {
      failure = 'Stock has no valid Realtime Database price.';
      return;
    }

    // The order executes at the POST-impact price: a buy fills above the mid,
    // a sell fills below it, so the trader pays for the price move their own
    // order causes. This removes the buy-low/tick-up/sell-high pump loop.
    const impactRate = computeTradeImpact(stock, sharesToTrade);
    const executionPrice = Number((action === 'buy'
      ? price * (1 + impactRate)
      : price * (1 - impactRate)
    ).toFixed(4));
    const total = Number((executionPrice * sharesToTrade).toFixed(4));

    if (action === 'buy' && cash < total) {
      failure = 'Not enough cash to buy these shares.';
      return;
    }
    if (action === 'sell' && ownedShares < sharesToTrade) {
      failure = 'Not enough shares to sell.';
      return;
    }

    const updatedCash = Number((cash + (action === 'buy' ? -total : total)).toFixed(4));
    const updatedShares = ownedShares + (action === 'buy' ? sharesToTrade : -sharesToTrade);
    // Trades shift the stock's activity value AND settle at the impacted
    // price. Activity then decays through the accelerated OU reversion.
    const currentActivity = normalizeActivity(stock.stockActivity);
    const updatedActivity = clamp(
      currentActivity + (action === 'buy' ? impactRate : -impactRate),
      ACTIVITY_MIN,
      ACTIVITY_MAX
    );
    if (updatedShares > 0) holdings[normalizedSymbol] = updatedShares;
    else delete holdings[normalizedSymbol];

    users[discordUserId] = {
      ...user,
      discordUserId,
      cash: updatedCash,
      holdings,
      createdAt: user.createdAt || now,
      updatedAt: now
    };
    stocks[normalizedSymbol] = {
      ...stock,
      price: executionPrice,
      stockActivity: Number(updatedActivity.toFixed(6)),
      updatedAt: now
    };
    tradeResult = {
      ok: true,
      action,
      symbol: normalizedSymbol,
      quantity: sharesToTrade,
      price,
      executionPrice,
      impact: Number(impactRate.toFixed(6)),
      stockActivity: Number(updatedActivity.toFixed(6)),
      total,
      cash: updatedCash
    };

    return {
      ...root,
      users,
      stocks,
      market: {
        ...(isRecord(root.market) ? root.market : {}),
        summary: {
          ...(isRecord(root.market?.summary) ? root.market.summary : {}),
          updatedAt: now
        }
      }
    };
  });

  if (!result.committed) return { ok: false, message: failure };
  return { ...tradeResult, portfolio: await getPortfolioFromDb(discordUserId) };
}