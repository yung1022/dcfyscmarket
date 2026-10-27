const elements = {
  channelList: document.getElementById('stockList'),
  marketTableBody: document.getElementById('marketTableBody'),
  selectedChannel: document.getElementById('selectedCompany'),
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
  marketTickButton: document.getElementById('refreshButton'),
};

let stocks = [];
let selectedSymbol = '';
let isLoggedIn = false;
let activeInterval = 'history';

const INTERVAL_SERIES = {
  history: 'history',
  history10: 'history10',
  history50: 'history50',
  history100: 'history100'
};

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
  document.getElementById('marketTotalValue').textContent = summary.marketTotalValue || '--';
  document.getElementById('marketTotalDelta').textContent = summary.marketTotalDelta || '--';
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
    const channel = document.createElement('strong');
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
    channel.textContent = stock.company;
    symbol.textContent = stock.symbol;
    value.textContent = formatMoney(stock.price);
    change.textContent = `${Number(stock.change) > 0 ? '+' : ''}${Number(stock.change || 0).toFixed(2)}%`;
    change.className = Number(stock.change) < 0 ? 'negative' : 'positive';

    name.append(channel, symbol);
    summary.append(icon, name);
    price.append(value, change);
    button.append(summary, price);
    button.addEventListener('click', () => selectStock(stock.symbol));
    item.append(button);
    return item;
  });

  elements.channelList.replaceChildren(...items);
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
  elements.selectedChannel.textContent = stock.company;
  elements.selectedSymbol.textContent = stock.symbol;
  elements.selectedPrice.textContent = formatMoney(stock.price);
  elements.selectedChange.textContent = `${Number(stock.change) > 0 ? '+' : ''}${Number(stock.change || 0).toFixed(2)}%`;
  elements.selectedChange.className = `pill ${Number(stock.change) < 0 ? 'negative' : 'positive'}`;
  elements.lastUpdated.textContent = stock.updatedAt ? new Date(stock.updatedAt).toLocaleTimeString() : '--';
  elements.dayRange.textContent = stock.dayRange || '--';
  elements.stockVolume.textContent = stock.volume || '--';
  elements.marketCap.textContent = stock.marketCap || '--';
  elements.yearRange.textContent = stock.yearRange || '--';
  renderActivity(stock);
  renderPriceChart(stock[INTERVAL_SERIES[activeInterval]] || stock.history || []);
  renderMiniCharts(stock);
}

function renderActivity(stock) {
  const activity = Number(stock.stockActivity) || 0;
  const percent = (activity + 1) / 2 * 100; // -1..1 mapped to 0..100%
  const bar = document.getElementById('activityBar');
  const value = document.getElementById('activityValue');
  if (!bar || !value) return;

  bar.style.left = `${Math.min(percent, 99).toFixed(2)}%`;
  bar.style.width = '2px';
  bar.style.background = activity >= 0 ? '#25c98a' : '#ff6b81';
  value.textContent = activity.toFixed(4);
  value.className = `activity-value ${activity >= 0 ? 'positive' : 'negative'}`;
}

function renderPriceChart(history) {
  const values = (history || []).map(Number).filter(Number.isFinite);
  if (!values.length) {
    values.push(0, 0);
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

function renderMiniCharts(stock) {
  const map = [
    ['miniChart10', stock.history10],
    ['miniChart50', stock.history50],
    ['miniChart100', stock.history100]
  ];

  map.forEach(([id, series]) => {
    const chart = document.getElementById(id);
    if (!chart) return;
    const values = (series || []).map(Number).filter(Number.isFinite);
    if (values.length < 2) {
      chart.innerHTML = '<path class="chart-line" d=""/>';
      return;
    }

    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum || 1;
    const points = values.map((value, index) => {
      const x = (index / (values.length - 1)) * 760;
      const y = 220 - ((value - minimum) / range) * 200;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point}`).join(' ');
    chart.innerHTML = `<path class="chart-line" d="${line}"/>`;
  });
}

async function loadMarket() {
  try {
    const snapshot = await requestJson('/api/market-updater');
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

async function triggerRefresh() {
  elements.marketTickButton.disabled = true;
  elements.marketStatusText.textContent = 'Refreshing market...';
  await loadMarket();
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
elements.marketTickButton.addEventListener('click', triggerRefresh);

// Interval tab switching: which sampled series feeds the main chart.
document.getElementById('chartTabs').addEventListener('click', (event) => {
  const button = event.target.closest('.chart-tab');
  if (!button) return;
  activeInterval = button.dataset.interval || 'history';
  document.querySelectorAll('.chart-tab').forEach((tab) => {
    tab.classList.toggle('active', tab === button);
  });
  const stock = stocks.find((item) => item.symbol === selectedSymbol);
  if (stock) renderSelectedStock();
});
window.addEventListener('discord-session-ready', () => loadPortfolio());

setTradeControls(false);
loadMarket();
loadPortfolio();
window.setInterval(loadMarket, 15000);
window.setInterval(loadPortfolio, 30000);
