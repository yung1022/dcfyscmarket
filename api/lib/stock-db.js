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

function getMemoryStore() {
  if (!globalThis.__dcfyscmarketStocks) {
    globalThis.__dcfyscmarketStocks = {};
  }

  return globalThis.__dcfyscmarketStocks;
}

export async function saveStockToDb(symbol, stock) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const payload = {
    ...stock,
    symbol: normalizedSymbol,
    updatedAt: stock.updatedAt || new Date().toISOString()
  };

  const app = initAdmin();

  if (!app) {
    const store = getMemoryStore();
    store[normalizedSymbol] = payload;
    return { mode: 'memory', data: payload };
  }

  try {
    const db = admin.firestore();
    await db.collection('stocks').doc(normalizedSymbol).set(payload);
    return { mode: 'firebase-admin-firestore', data: payload };
  } catch (error) {
    try {
      const db = admin.database();
      await db.ref('stocks').child(normalizedSymbol).set(payload);
      return { mode: 'firebase-admin-rtdb', data: payload };
    } catch (rtdbError) {
      throw new Error(`Firebase write failed: ${rtdbError.message || rtdbError}`);
    }
  }
}

export async function getStockFromDb(symbol) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const app = initAdmin();

  if (!app) {
    const store = getMemoryStore();
    return store[normalizedSymbol] || null;
  }

  try {
    const snapshot = await admin.firestore().collection('stocks').doc(normalizedSymbol).get();
    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data();
  } catch (error) {
    try {
      const snapshot = await admin.database().ref('stocks').child(normalizedSymbol).once('value');
      return snapshot.val();
    } catch (dbError) {
      return null;
    }
  }
}
