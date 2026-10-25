const elements = {
  stockList: document.getElementById('stockList'),
  marketTableBody: document.getElementById('marketTableBody'),
  selectedCompany: document.getElementById('selectedCompany'),
  selectedSymbol: document.getElementById('selectedSymbol'),
  selectedChange: document.getElementById('selectedChange'),
  selectedPrice: document.getElementById('selectedPrice'),
  lastUpdated: document.getElementById('lastUpdated'),
  priceChart: document.getElementById('priceChart'),
  dayRange: document.getElementById('dayRange'),
  stockVolume: document.getElementById('stockVolume'),
  marketCap: document.getElementById('marketCap'),
  yearRange: document.getElementById('yearRange'),
  tradeQty: document.getElementById('tradeQty'),
  buyBtn: document.getElementById('buyBtn'),
  sellBtn: document.getElementById('sellBtn'),
  tradeStatus: document.getElementById('tradeStatus'),
  cashBalance: document.getElementById('cashBalance'),
  portfolioValue: document.getElementById('portfolioValue'),
  positionsList: document.getElementById('positionsList'),
  marketStatusText: document.getElementById('marketStatusText'),
  marketTickButton: document.getElementById('marketTickButton'),
};

let stocks = [];
let selectedSymbol = '';
let isLoggedIn = false;

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(result.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return result;
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(Number(value) || 0);
}

function setTradeControls(enabled) {
  isLoggedIn = enabled;
  elements.buyBtn.disabled = !enabled;
  elements.sellBtn.disabled = !enabled;
}

function renderMarketSummary(summary = {}) {
  document.getElementById('dowValue').textContent = summary.dow || '--';
  document.getElementById('dowDelta').textContent = summary.dowDelta || '--';
  document.getElementById('nasdaqValue').textContent = summary.nasdaq || '--';
  document.getElementById('nasdaqDelta').textContent = summary.nasdaqDelta || '--';
  document.getElementById('spValue').textContent = summary.sp || '--';
  document.getElementById('spDelta').textContent = summary.spDelta || '--';
  document.getElementById('sentimentValue').textContent = summary.sentiment || '--';
  document.getElementById('sentimentText').textContent = summary.sentimentText || '--';
}

function renderWatchlist() {
  const items = stocks.map((stock) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const summary = document.createElement('span');
    const icon = document.createElement('span');
    const name = document.createElement('span');
    const company = document.createElement('strong');
    const symbol = document.createElement('span');
    const price = document.createElement('span');
    const value = document.createElement('strong');
    const change = document.createElement('span');

    button.type = 'button';
    button.className = `stock-item${stock.symbol === selectedSymbol ? ' active' : ''}`;
    summary.className = 'stock-summary';
    icon.className = 'stock-icon';
    name.className = 'stock-name';
    price.className = 'stock-price';
    icon.textContent = stock.symbol.slice(0, 1);
    company.textContent = stock.company;
    symbol.textContent = stock.symbol;
    value.textContent = formatMoney(stock.price);
    change.textContent = `${Number(stock.change) > 0 ? '+' : ''}${Number(stock.change || 0).toFixed(2)}%`;
    change.className = Number(stock.change) < 0 ? 'negative' : 'positive';

    name.append(company, symbol);
    summary.append(icon, name);
    price.append(value, change);
    button.append(summary, price);
    button.addEventListener('click', () => selectStock(stock.symbol));
    item.append(button);
    return item;
  });

  elements.stockList.replaceChildren(...items);
}

function renderMarketTable() {
  const rows = stocks.map((stock) => {
    const row = document.createElement('tr');
    const change = Number(stock.change) || 0;
    const values = [
      stock.symbol,
      stock.company,
      formatMoney(stock.price),
      `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
      stock.volume || '--'
    ];

    values.forEach((value, index) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (index === 3) cell.className = change < 0 ? 'negative' : 'positive';
      row.append(cell);
    });
    row.tabIndex = 0;
    row.addEventListener('click', () => selectStock(stock.symbol));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') selectStock(stock.symbol);
    });
    return row;
  });

  elements.marketTableBody.replaceChildren(...rows);
}

function selectStock(symbol) {
  selectedSymbol = symbol;
  renderWatchlist();
  renderSelectedStock();
}

function renderSelectedStock() {
  const stock = stocks.find((item) => item.symbol === selectedSymbol) || stocks[0];
  if (!stock) return;

  selectedSymbol = stock.symbol;
  elements.selectedCompany.textContent = stock.company;
  elements.selectedSymbol.textContent = stock.symbol;
  elements.selectedPrice.textContent = formatMoney(stock.price);
  elements.selectedChange.textContent = `${Number(stock.change) > 0 ? '+' : ''}${Number(stock.change || 0).toFixed(2)}%`;
  elements.selectedChange.className = `pill ${Number(stock.change) < 0 ? 'negative' : 'positive'}`;
  elements.lastUpdated.textContent = stock.updatedAt ? new Date(stock.updatedAt).toLocaleTimeString() : '--';
  elements.dayRange.textContent = stock.dayRange || '--';
  elements.stockVolume.textContent = stock.volume || '--';
  elements.marketCap.textContent = stock.marketCap || '--';
  elements.yearRange.textContent = stock.yearRange || '--';
  renderPriceChart(stock.history || []);
}

function renderPriceChart(history) {
  const values = history.map(Number).filter(Number.isFinite);
  if (!values.length) {
    elements.priceChart.replaceChildren();
    return;
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 380 : (index / (values.length - 1)) * 760;
    const y = 220 - ((value - minimum) / range) * 200;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point}`).join(' ');
  const area = `${line} L 760,240 L 0,240 Z`;

  elements.priceChart.innerHTML = `<defs><linearGradient id="lineGradient" x1="0" x2="1"><stop offset="0%" stop-color="#25c98a"/><stop offset="100%" stop-color="#66e0b0"/></linearGradient><linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#25c98a" stop-opacity=".26"/><stop offset="100%" stop-color="#25c98a" stop-opacity="0"/></linearGradient></defs><path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>`;
}

async function loadMarket(advance = false) {
  try {
    const snapshot = await requestJson('/api/market-updater', advance ? { method: 'POST' } : {});
    stocks = snapshot.stocks || [];
    if (!stocks.some((stock) => stock.symbol === selectedSymbol)) {
      selectedSymbol = stocks[0]?.symbol || '';
    }
    renderMarketSummary(snapshot.marketSummary);
    renderWatchlist();
    renderMarketTable();
    renderSelectedStock();
    elements.marketStatusText.textContent = 'Firebase market data';
  } catch (error) {
    elements.marketStatusText.textContent = 'Market API unavailable';
    elements.tradeStatus.textContent = error.message;
  }
}

async function triggerMarketTick() {
  elements.marketTickButton.disabled = true;
  elements.marketStatusText.textContent = 'Updating market...';
  await loadMarket(true);
  elements.marketTickButton.disabled = false;
}

async function loadPortfolio() {
  try {
    const portfolio = await requestJson('/api/portfolio');
    setTradeControls(true);
    elements.cashBalance.textContent = formatMoney(portfolio.cash);
    elements.portfolioValue.textContent = formatMoney(portfolio.portfolioValue);
    const positions = portfolio.holdings || [];
    const items = positions.map((position) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      const value = document.createElement('strong');
      label.textContent = `${position.symbol} | ${position.shares} shares`;
      value.textContent = formatMoney(position.value);
      item.append(label, value);
      return item;
    });
    if (!items.length) {
      const item = document.createElement('li');
      item.textContent = 'No open positions';
      items.push(item);
    }
    elements.positionsList.replaceChildren(...items);
  } catch (error) {
    setTradeControls(false);
    if (error.status === 401) {
      elements.cashBalance.textContent = '--';
      elements.portfolioValue.textContent = '--';
      elements.positionsList.replaceChildren();
      elements.tradeStatus.textContent = 'Log in with Discord to trade.';
      return;
    }
    elements.tradeStatus.textContent = error.message;
  }
}

async function submitTrade(action) {
  if (!isLoggedIn) {
    elements.tradeStatus.textContent = 'Log in with Discord to trade.';
    return;
  }

  const quantity = Number(elements.tradeQty.value);
  if (!Number.isInteger(quantity) || quantity < 1 || !selectedSymbol) {
    elements.tradeStatus.textContent = 'Enter a whole number of shares.';
    return;
  }

  setTradeControls(false);
  elements.tradeStatus.textContent = 'Submitting trade...';
  try {
    const result = await requestJson('/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol: selectedSymbol, action, quantity })
    });
    elements.tradeStatus.textContent = `${action === 'buy' ? 'Bought' : 'Sold'} ${quantity} ${selectedSymbol} at ${formatMoney(result.price)}.`;
    await Promise.all([loadPortfolio(), loadMarket()]);
  } catch (error) {
    elements.tradeStatus.textContent = error.message;
    setTradeControls(true);
  }
}

elements.buyBtn.addEventListener('click', () => submitTrade('buy'));
elements.sellBtn.addEventListener('click', () => submitTrade('sell'));
elements.marketTickButton.addEventListener('click', triggerMarketTick);
window.addEventListener('discord-session-ready', () => loadPortfolio());

setTradeControls(false);
loadMarket();
loadPortfolio();
window.setInterval(loadMarket, 15000);
window.setInterval(loadPortfolio, 30000);
