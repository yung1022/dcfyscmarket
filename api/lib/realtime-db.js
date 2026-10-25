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
    createdAt: updatedAt,
    updatedAt
  };
}

function buildPriceUpdate(stock, nextPrice, updatedAt) {
  const previousPrice = Number(stock.price) || 0;
  const history = (Array.isArray(stock.history) ? stock.history : [])
    .map(Number)
    .filter(Number.isFinite);
  if (!history.length && previousPrice > 0) history.push(previousPrice);
  history.push(nextPrice);
  if (history.length > 50) history.shift();

  const previous = history.length > 1 ? history[history.length - 2] : nextPrice;
  const recent = history.slice(-12);
  const update = {
    price: nextPrice,
    change: previous > 0 ? Number((((nextPrice - previous) / previous) * 100).toFixed(2)) : 0,
    history,
    dayRange: `${Math.min(...recent).toFixed(2)} - ${Math.max(...recent).toFixed(2)}`,
    updatedAt
  };

  if (previousPrice > 0) {
    const ratio = nextPrice / previousPrice;
    for (const field of ['marketCap', 'value']) {
      const existingValue = Number(stock[field]);
      if (Number.isFinite(existingValue)) update[field] = Number((existingValue * ratio).toFixed(2));
    }
  }

  return update;
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
  const marketSummary = summarySnapshot.exists() ? summarySnapshot.val() : summaryResult.snapshot.val();

  return {
    stocks,
    updatedAt: marketSummary.updatedAt || null,
    marketSummary
  };
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

    const direction = Math.random() < 0.5 ? -1 : 1;
    const percent = 0.001 + Math.random() * 0.009;
    const movement = Math.max(0.01, Number((currentPrice * percent).toFixed(2)));
    const nextPrice = Number(Math.max(0.01, currentPrice + direction * movement).toFixed(2));
    updates[`stocks/${symbol}`] = { ...stock, ...buildPriceUpdate(stock, nextPrice, updatedAt) };
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
  const positions = Object.entries(user.holdings).map(([symbol, rawShares]) => {
    const shares = Number(rawShares) || 0;
    const stock = stocks[symbol];
    const price = Number(stock?.price) || 0;
    return {
      symbol,
      shares,
      price,
      value: Number((shares * price).toFixed(2)),
      change: Number(stock?.change) || 0
    };
  });

  return {
    userId: discordUserId,
    cash: Number(user.cash.toFixed(2)),
    portfolioValue: Number((user.cash + positions.reduce((sum, position) => sum + position.value, 0)).toFixed(2)),
    holdings: positions,
    updatedAt: user.updatedAt
  };
}

export async function addCashToDb({ discordUserId, discordUsername, amount }) {
  const cashToAdd = Number(amount);
  if (!Number.isFinite(cashToAdd) || cashToAdd <= 0 || cashToAdd > 1000000000) {
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

  const result = await rootRef.transaction((current) => {
    const root = isRecord(current) ? current : {};
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
    const total = Number((price * sharesToTrade).toFixed(2));

    if (!Number.isFinite(price) || price <= 0) {
      failure = 'Stock has no valid Realtime Database price.';
      return;
    }
    if (action === 'buy' && cash < total) {
      failure = 'Not enough cash to buy these shares.';
      return;
    }
    if (action === 'sell' && ownedShares < sharesToTrade) {
      failure = 'Not enough shares to sell.';
      return;
    }

    const updatedCash = Number((cash + (action === 'buy' ? -total : total)).toFixed(2));
    const updatedShares = ownedShares + (action === 'buy' ? sharesToTrade : -sharesToTrade);
    const impactRate = Math.min(0.05, sharesToTrade * 0.001);
    const movement = Math.max(0.01, Number((price * impactRate).toFixed(2)));
    const updatedPrice = Number(Math.max(0.01, price + (action === 'buy' ? movement : -movement)).toFixed(2));
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
      ...buildPriceUpdate(stock, updatedPrice, now)
    };
    tradeResult = {
      ok: true,
      action,
      symbol: normalizedSymbol,
      quantity: sharesToTrade,
      price,
      updatedPrice,
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