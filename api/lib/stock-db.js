function getDbConfig() {
  const databaseUrl = process.env.DATABASE_URL || process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_URL;
  const dbSecret = process.env.DB_SECRET || process.env.FIREBASE_DB_SECRET || process.env.FIREBASE_TOKEN;

  return { databaseUrl, dbSecret };
}

function getMemoryStore() {
  if (!globalThis.__dcfyscmarketStocks) {
    globalThis.__dcfyscmarketStocks = {};
  }

  return globalThis.__dcfyscmarketStocks;
}

export async function saveStockToDb(symbol, stock) {
  const { databaseUrl, dbSecret } = getDbConfig();
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();

  if (!databaseUrl) {
    const store = getMemoryStore();
    store[normalizedSymbol] = { ...stock, symbol: normalizedSymbol };
    return { mode: 'memory', data: store[normalizedSymbol] };
  }

  const url = new URL(`${databaseUrl.replace(/\/$/, '')}/stocks/${normalizedSymbol}.json`);
  if (dbSecret) {
    url.searchParams.set('auth', dbSecret);
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...stock,
      symbol: normalizedSymbol
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Database request failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return { mode: 'firebase', data };
}

export function getStockFromDb(symbol) {
  const store = getMemoryStore();
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();

  if (!store[normalizedSymbol]) {
    return null;
  }

  return store[normalizedSymbol];
}
