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

function initAdmin() {
  if (admin.apps.length) {
    return admin.app();
  }

  const config = getFirebaseConfig();

  if (!config.projectId || !config.clientEmail || !config.privateKey) {
    return null;
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.projectId,
      clientEmail: config.clientEmail,
      privateKey: config.privateKey
    }),
    databaseURL: config.databaseURL
  });
}

export function getFirestoreDb() {
  if (!initAdmin()) {
    throw new Error('Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
  }

  return admin.firestore();
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
      if (Number.isFinite(existingValue)) {
        update[field] = Number((existingValue * ratio).toFixed(2));
      }
    }
  }

  return update;
}

export async function upsertDiscordUser(discordUserId, discordUsername, profile = {}) {
  const now = new Date().toISOString();
  const ref = getFirestoreDb().collection('users').doc(discordUserId);
  const snapshot = await ref.get();
  const existing = snapshot.exists ? snapshot.data() : {};
  const data = {
    ...existing,
    ...profile,
    discordUserId,
    discordUsername,
    cash: Number.isFinite(Number(existing.cash)) ? Number(existing.cash) : 100000,
    holdings: existing.holdings || {},
    createdAt: existing.createdAt || now,
    lastLoginAt: now,
    updatedAt: now
  };

  await ref.set(data, { merge: true });
  return { mode: 'firebase-admin-firestore', data };
}

export async function saveStockToDb(symbol, stock) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const payload = {
    ...stock,
    symbol: normalizedSymbol,
    updatedAt: stock.updatedAt || new Date().toISOString()
  };

  await getFirestoreDb().collection('stocks').doc(normalizedSymbol).set(payload);
  return { mode: 'firebase-admin-firestore', data: payload };
}

export async function createStockForCompany(company, stock) {
  const baseSymbol = String(company)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 10);

  if (!baseSymbol) {
    throw new Error('Company name must include letters or numbers.');
  }

  const db = getFirestoreDb();
  const now = new Date().toISOString();
  return db.runTransaction(async (transaction) => {
    for (let suffix = 0; suffix < 1000; suffix += 1) {
      const suffixText = suffix ? String(suffix) : '';
      const symbol = `${baseSymbol.slice(0, 10 - suffixText.length)}${suffixText}`;
      const ref = db.collection('stocks').doc(symbol);
      const existing = await transaction.get(ref);
      if (existing.exists) continue;

      const data = {
        ...stock,
        symbol,
        company: String(company).trim(),
        createdAt: now,
        updatedAt: now
      };
      transaction.create(ref, data);
      return { mode: 'firebase-admin-firestore', data };
    }

    throw new Error('Could not generate a unique symbol for this company.');
  });
}

export async function getStockFromDb(symbol) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const snapshot = await getFirestoreDb().collection('stocks').doc(normalizedSymbol).get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function getMarketDataFromDb() {
  const db = getFirestoreDb();
  const [stocksSnapshot, summarySnapshot] = await Promise.all([
    db.collection('stocks').get(),
    db.collection('market').doc('summary').get()
  ]);
  const stocks = stocksSnapshot.docs
    .map((document) => document.data())
    .filter((stock) => stock.symbol && Number.isFinite(Number(stock.price)) && Number(stock.price) > 0);

  return {
    stocks,
    updatedAt: summarySnapshot.exists ? summarySnapshot.data().updatedAt : null,
    marketSummary: summarySnapshot.exists ? summarySnapshot.data() : {}
  };
}

export async function tickMarketInDb() {
  const db = getFirestoreDb();
  const snapshot = await db.collection('stocks').get();
  if (snapshot.empty) {
    throw new Error('No stocks found in Firebase collection "stocks".');
  }

  const updatedAt = new Date().toISOString();
  const batch = db.batch();
  snapshot.docs.forEach((document) => {
    const stock = document.data();
    const currentPrice = Number(stock.price);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;

    const direction = Math.random() < 0.5 ? -1 : 1;
    const percent = 0.001 + Math.random() * 0.009;
    const movement = Math.max(0.01, Number((currentPrice * percent).toFixed(2)));
    const nextPrice = Number(Math.max(0.01, currentPrice + direction * movement).toFixed(2));
    batch.set(document.ref, buildPriceUpdate(stock, nextPrice, updatedAt), { merge: true });
  });

  batch.set(db.collection('market').doc('summary'), { updatedAt }, { merge: true });
  await batch.commit();
  return getMarketDataFromDb();
}

export async function getPortfolioFromDb(discordUserId) {
  const db = getFirestoreDb();
  const userRef = db.collection('users').doc(discordUserId);
  const now = new Date().toISOString();
  const snapshot = await userRef.get();
  const user = snapshot.exists ? snapshot.data() : {};
  const cash = Number.isFinite(Number(user.cash)) ? Number(user.cash) : 100000;
  const holdings = user.holdings && typeof user.holdings === 'object' ? user.holdings : {};

  if (!snapshot.exists || !Number.isFinite(Number(user.cash)) || !user.holdings) {
    await userRef.set({
      cash,
      holdings,
      createdAt: user.createdAt || now,
      updatedAt: now
    }, { merge: true });
  }

  const stockSnapshot = await db.collection('stocks').get();
  const stocks = new Map(stockSnapshot.docs.map((document) => [document.id, document.data()]));
  const positions = Object.entries(holdings).map(([symbol, rawShares]) => {
    const shares = Number(rawShares) || 0;
    const stock = stocks.get(symbol);
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
    cash: Number(cash.toFixed(2)),
    portfolioValue: Number((cash + positions.reduce((sum, position) => sum + position.value, 0)).toFixed(2)),
    holdings: positions,
    updatedAt: user.updatedAt || now
  };
}

export async function placeTradeInDb({ discordUserId, symbol, action, quantity }) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const sharesToTrade = Number(quantity);
  if (!normalizedSymbol || !['buy', 'sell'].includes(action) || !Number.isInteger(sharesToTrade) || sharesToTrade <= 0) {
    return { ok: false, message: 'Enter a valid symbol and whole-share quantity.' };
  }

  const db = getFirestoreDb();
  const userRef = db.collection('users').doc(discordUserId);
  const stockRef = db.collection('stocks').doc(normalizedSymbol);
  const now = new Date().toISOString();
  const result = await db.runTransaction(async (transaction) => {
    const [userSnapshot, stockSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(stockRef)
    ]);

    if (!stockSnapshot.exists) return { ok: false, message: 'Stock not found in Firebase.' };
    const stock = stockSnapshot.data();
    const price = Number(stock.price);
    if (!Number.isFinite(price) || price <= 0) return { ok: false, message: 'Stock has no valid Firebase price.' };

    const user = userSnapshot.exists ? userSnapshot.data() : {};
    const cash = Number.isFinite(Number(user.cash)) ? Number(user.cash) : 100000;
    const holdings = user.holdings && typeof user.holdings === 'object' ? { ...user.holdings } : {};
    const ownedShares = Number(holdings[normalizedSymbol]) || 0;
    const total = Number((price * sharesToTrade).toFixed(2));

    if (action === 'buy' && cash < total) return { ok: false, message: 'Not enough cash to buy these shares.' };
    if (action === 'sell' && ownedShares < sharesToTrade) return { ok: false, message: 'Not enough shares to sell.' };

    const updatedCash = Number((cash + (action === 'buy' ? -total : total)).toFixed(2));
    const updatedShares = ownedShares + (action === 'buy' ? sharesToTrade : -sharesToTrade);
    const impactRate = Math.min(0.05, sharesToTrade * 0.001);
    const priceMovement = Math.max(0.01, Number((price * impactRate).toFixed(2)));
    const updatedPrice = Number(Math.max(0.01, price + (action === 'buy' ? priceMovement : -priceMovement)).toFixed(2));
    if (updatedShares > 0) holdings[normalizedSymbol] = updatedShares;
    else delete holdings[normalizedSymbol];

    transaction.set(userRef, {
      cash: updatedCash,
      holdings,
      createdAt: user.createdAt || now,
      updatedAt: now
    }, { merge: true });
    transaction.set(stockRef, buildPriceUpdate(stock, updatedPrice, now), { merge: true });

    return { ok: true, action, symbol: normalizedSymbol, quantity: sharesToTrade, price, updatedPrice, total, cash: updatedCash };
  });

  if (!result.ok) return result;
  return { ...result, portfolio: await getPortfolioFromDb(discordUserId) };
}
