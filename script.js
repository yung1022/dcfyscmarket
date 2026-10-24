const fallbackStocks = [
  {
    symbol: 'AAPL',
    company: 'Apple Inc.',
    price: 214.86,
    change: 1.35,
    volume: '52.1M',
    marketCap: '3.2T',
    yearRange: '164.08 - 237.49',
    dayRange: '212.10 - 216.25',
    sentiment: 'Bullish',
    history: [191, 193, 196, 195, 201, 205, 208, 210, 214, 214, 215, 214.86]
  },
  {
    symbol: 'MSFT',
    company: 'Microsoft',
    price: 447.12,
    change: 2.58,
    volume: '28.6M',
    marketCap: '3.3T',
    yearRange: '349.67 - 468.35',
    dayRange: '440.15 - 449.80',
    sentiment: 'Bullish',
    history: [388, 390, 392, 396, 401, 410, 415, 418, 422, 426, 439, 447.12]
  },
  {
    symbol: 'NVDA',
    company: 'NVIDIA',
    price: 136.74,
    change: -0.82,
    volume: '43.9M',
    marketCap: '3.4T',
    yearRange: '78.62 - 140.76',
    dayRange: '134.29 - 138.18',
    sentiment: 'Neutral',
    history: [118, 120, 124, 127, 129, 131, 129, 130, 133, 135, 137, 136.74]
  },
  {
    symbol: 'AMZN',
    company: 'Amazon',
    price: 184.22,
    change: 1.12,
    volume: '24.8M',
    marketCap: '1.9T',
    yearRange: '145.86 - 201.20',
    dayRange: '181.55 - 185.90',
    sentiment: 'Bullish',
    history: [172, 171, 174, 176, 178, 181, 182, 179, 181, 183, 185, 184.22]
  },
  {
    symbol: 'GOOGL',
    company: 'Alphabet',
    price: 175.36,
    change: 0.77,
    volume: '21.3M',
    marketCap: '2.1T',
    yearRange: '142.80 - 193.38',
    dayRange: '172.48 - 176.15',
    sentiment: 'Bullish',
    history: [156, 158, 161, 161, 163, 167, 169, 171, 172, 173, 174, 175.36]
  },
  {
    symbol: 'TSLA',
    company: 'Tesla',
    price: 244.98,
    change: -2.41,
    volume: '62.4M',
    marketCap: '786B',
    yearRange: '138.80 - 299.29',
    dayRange: '241.50 - 249.32',
    sentiment: 'Bearish',
    history: [266, 268, 265, 262, 257, 255, 251, 248, 246, 249, 245, 244.98]
  }
];

const state = {
  stocks: [],
  selectedSymbol: 'AAPL',
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

const elements = {
  stockList: document.getElementById('stockList'),
  marketTableBody: document.getElementById('marketTableBody'),
  dowValue: document.getElementById('dowValue'),
  dowDelta: document.getElementById('dowDelta'),
  nasdaqValue: document.getElementById('nasdaqValue'),
  nasdaqDelta: document.getElementById('nasdaqDelta'),
  spValue: document.getElementById('spValue'),
  spDelta: document.getElementById('spDelta'),
  sentimentValue: document.getElementById('sentimentValue'),
  sentimentText: document.getElementById('sentimentText'),
  selectedCompany: document.getElementById('selectedCompany'),
  selectedSymbol: document.getElementById('selectedSymbol'),
  selectedChange: document.getElementById('selectedChange'),
  selectedPrice: document.getElementById('selectedPrice'),
  lastUpdated: document.getElementById('lastUpdated'),
  dayRange: document.getElementById('dayRange'),
  stockVolume: document.getElementById('stockVolume'),
  marketCap: document.getElementById('marketCap'),
  yearRange: document.getElementById('yearRange'),
  chart: document.getElementById('priceChart')
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatChange(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function normalizeStock(data) {
  const safePrice = Number(data.price ?? 0);
  const safeChange = Number(data.change ?? 0);
  const safeHistory = Array.isArray(data.history) ? data.history.map(Number) : [];

  return {
    symbol: data.symbol || 'SYM',
    company: data.company || data.name || 'Company',
    price: safePrice,
    change: safeChange,
    volume: data.volume || 'N/A',
    marketCap: data.marketCap || 'N/A',
    yearRange: data.yearRange || 'N/A',
    dayRange: data.dayRange || 'N/A',
    sentiment: data.sentiment || (safeChange >= 0 ? 'Bullish' : 'Bearish'),
    history: safeHistory.length ? safeHistory : [safePrice, safePrice]
  };
}

function updateMarketSummary() {
  elements.dowValue.textContent = state.marketSummary.dow;
  elements.dowDelta.textContent = state.marketSummary.dowDelta;
  elements.dowDelta.className = state.marketSummary.dowDelta.includes('-') ? 'negative' : 'positive';

  elements.nasdaqValue.textContent = state.marketSummary.nasdaq;
  elements.nasdaqDelta.textContent = state.marketSummary.nasdaqDelta;
  elements.nasdaqDelta.className = state.marketSummary.nasdaqDelta.includes('-') ? 'negative' : 'positive';

  elements.spValue.textContent = state.marketSummary.sp;
  elements.spDelta.textContent = state.marketSummary.spDelta;
  elements.spDelta.className = state.marketSummary.spDelta.includes('-') ? 'negative' : 'positive';

  elements.sentimentValue.textContent = state.marketSummary.sentiment;
  elements.sentimentText.textContent = state.marketSummary.sentimentText;
  elements.sentimentValue.className = state.marketSummary.sentiment === 'Bullish' ? 'positive' : state.marketSummary.sentiment === 'Bearish' ? 'negative' : 'neutral';
}

function renderStockList() {
  elements.stockList.innerHTML = '';

  state.stocks.forEach((stock) => {
    const item = document.createElement('li');
    const isActive = stock.symbol === state.selectedSymbol;
    item.className = `stock-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <div class="stock-summary">
        <div class="stock-icon">${stock.symbol.slice(0, 2)}</div>
        <div class="stock-name">
          <strong>${stock.symbol}</strong>
          <span>${stock.company}</span>
        </div>
      </div>
      <div class="stock-price">
        <strong>${formatCurrency(stock.price)}</strong>
        <span class="${stock.change >= 0 ? 'positive' : 'negative'}">${formatChange(stock.change)}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      state.selectedSymbol = stock.symbol;
      render();
    });

    elements.stockList.appendChild(item);
  });
}

function renderMarketTable() {
  elements.marketTableBody.innerHTML = '';

  state.stocks.forEach((stock) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="symbol-cell">${stock.symbol}</td>
      <td>${stock.company}</td>
      <td>${formatCurrency(stock.price)}</td>
      <td class="${stock.change >= 0 ? 'change-positive' : 'change-negative'}">${formatChange(stock.change)}</td>
      <td>${stock.volume}</td>
    `;

    row.addEventListener('click', () => {
      state.selectedSymbol = stock.symbol;
      render();
    });

    elements.marketTableBody.appendChild(row);
  });
}

function drawChart(values) {
  const svg = elements.chart;
  const width = 760;
  const height = 240;
  const padding = 18;

  if (!values || !values.length) {
    svg.innerHTML = '';
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((point, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((point - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `${points} ${width - padding},${height - padding} ${padding},${height - padding}`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#58d3ff" />
        <stop offset="100%" stop-color="#35f0b3" />
      </linearGradient>
      <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="rgba(72, 224, 177, 0.38)" />
        <stop offset="100%" stop-color="rgba(72, 224, 177, 0.02)" />
      </linearGradient>
    </defs>
    <polyline class="chart-area" points="${areaPoints}" />
    <polyline class="chart-line" points="${points}" />
  `;
}

function renderSelectedStock() {
  const stock = state.stocks.find((item) => item.symbol === state.selectedSymbol) || state.stocks[0];

  if (!stock) {
    return;
  }

  elements.selectedCompany.textContent = stock.company;
  elements.selectedSymbol.textContent = stock.symbol;
  elements.selectedPrice.textContent = formatCurrency(stock.price);
  elements.selectedChange.textContent = `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`;
  elements.selectedChange.className = `pill ${stock.change >= 0 ? 'positive' : 'negative'}`;
  elements.dayRange.textContent = stock.dayRange;
  elements.stockVolume.textContent = stock.volume;
  elements.marketCap.textContent = stock.marketCap;
  elements.yearRange.textContent = stock.yearRange;
  elements.lastUpdated.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  drawChart(stock.history);
}

function render() {
  updateMarketSummary();
  renderStockList();
  renderMarketTable();
  renderSelectedStock();
}

function loadFallbackData() {
  state.stocks = fallbackStocks.map(normalizeStock);
  state.selectedSymbol = state.stocks[0]?.symbol || 'AAPL';
  render();
}

function initializeFirebase() {
  const firebaseConfig = window.firebaseConfig || {};

  const hasConfig = firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes('YOUR_') &&
    !firebaseConfig.projectId.includes('YOUR_');

  if (!hasConfig) {
    loadFallbackData();
    return;
  }

  const app = firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore(app);

  db.collection('stocks')
    .onSnapshot((snapshot) => {
      if (!snapshot.empty) {
        state.stocks = snapshot.docs.map((doc) => normalizeStock(doc.data()));
        if (!state.stocks.find((stock) => stock.symbol === state.selectedSymbol)) {
          state.selectedSymbol = state.stocks[0]?.symbol || 'AAPL';
        }
        render();
      } else {
        loadFallbackData();
      }
    }, () => {
      loadFallbackData();
    });
}

window.addEventListener('DOMContentLoaded', () => {
  initializeFirebase();
});
