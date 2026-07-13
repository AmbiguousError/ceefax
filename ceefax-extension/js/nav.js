import { COLS, ROWS, renderPage } from "./render.js";

const ROTATE_MS = 8000;
const INPUT_RESET_MS = 4000;
const HISTORY_MAX = 20;

// Row 0 of every page reserves its trailing 8 columns for the live header
// clock, which repaints them every second regardless of page content - keep
// this in sync with HEADER_CLOCK_WIDTH in data.js.
const HEADER_CLOCK_WIDTH = 8;
const HEADER_SAFE_WIDTH = COLS - HEADER_CLOCK_WIDTH - 1;

// Must match ARTICLE_PAGE_START/ARTICLE_COUNT/WEATHER_CITIES/REDDIT_SUBREDDITS
// in background.js/data.js - used only to tell "not fetched yet" (show a
// loading page) apart from "not a real page".
const ARTICLE_PAGE_START = 102;
const ARTICLE_COUNT = 5;
const WEATHER_CITY_BASES = [210, 220, 230, 240, 250, 260];
const REDDIT_SUBREDDIT_PAGES = [401, 402, 403, 404, 405, 406, 407, 408, 409];
const KNOWN_DYNAMIC_PAGES = new Set([
  101, 200, 300, 400,
  ...Array.from({ length: ARTICLE_COUNT }, (_, i) => ARTICLE_PAGE_START + i),
  ...WEATHER_CITY_BASES.flatMap((base) => [0, 1, 2, 3, 4, 5, 6, 7].map((offset) => base + offset)),
  ...REDDIT_SUBREDDIT_PAGES,
]);

const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FULL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function run(text, color) {
  return { text, color };
}

function centerText(text, width) {
  const trimmed = text.slice(0, width);
  const pad = Math.max(0, Math.floor((width - trimmed.length) / 2));
  return " ".repeat(pad) + trimmed;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatFullDate(date) {
  return `${FULL_DAY_NAMES[date.getDay()]} ${date.getDate()} ${FULL_MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function pageHeaderRow(pageNumber, title) {
  const prefix = `P${pageNumber}  CEEFAX`;
  const remaining = Math.max(0, HEADER_SAFE_WIDTH - prefix.length);
  const titleRun = title ? `  ${title}`.slice(0, remaining) : "";
  return [run(`P${pageNumber}`, "white"), run("  CEEFAX", "cyan"), run(titleRun, "yellow")];
}

// Dynamic FastText-style footer: always 4 colored links, excluding whichever
// top-level section the current page belongs to. Mirrored in data.js (which
// can't share this module - different execution context).
const NAV_SECTIONS = [
  { label: "Index", page: 100, color: "red" },
  { label: "News", page: 101, color: "green" },
  { label: "Weather", page: 200, color: "yellow" },
  { label: "Ticker", page: 300, color: "blue" },
  { label: "Reddit", page: 400, color: "magenta" },
  { label: "Clock", page: 800, color: "cyan" },
];

function buildFooterRow(sectionPage) {
  const candidates = NAV_SECTIONS.filter((s) => s.page !== sectionPage).slice(0, 4);
  const runs = candidates.map((s, i) => run((i === 0 ? " " : "   ") + s.label, s.color));
  return { runs, targets: candidates.map((s) => s.page) };
}

function page100Template() {
  const footer = buildFooterRow(100);
  const lines = [
    pageHeaderRow(100, "INDEX"),
    [],
    [run("              ", "white"), run("CEEFAX INDEX", "yellow")],
    [],
    [run(" 101", "cyan"), run(" News Headlines", "white")],
    [run(" 200", "cyan"), run(" Weather", "white")],
    [run(" 300", "cyan"), run(" Ticker", "white")],
    [run(" 400", "cyan"), run(" Reddit", "white")],
    [run(" 800", "cyan"), run(" Clock", "white")],
  ];
  const selectableItems = [
    { row: 4, page: 101 },
    { row: 5, page: 200 },
    { row: 6, page: 300 },
    { row: 7, page: 400 },
    { row: 8, page: 800 },
  ];
  while (lines.length < ROWS - 5) lines.push([]);
  lines.push([run(" Enter a page number, or use ↑↓ + Enter", "green")]);
  while (lines.length < ROWS - 1) lines.push([]);
  lines.push(footer.runs);

  return { page: 100, lines: lines.slice(0, ROWS), footerTargets: footer.targets, selectableItems };
}

function buildClockPage() {
  const now = new Date();
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const dateStr = formatFullDate(now);
  const footer = buildFooterRow(800);

  const lines = [pageHeaderRow(800, "CLOCK")];
  while (lines.length < 11) lines.push([]);
  lines.push([run(centerText(timeStr, COLS), "cyan")]);
  lines.push([]);
  lines.push([run(centerText(dateStr, COLS), "white")]);
  while (lines.length < ROWS - 1) lines.push([]);
  lines.push(footer.runs);

  return { page: 800, lines: lines.slice(0, ROWS), footerTargets: footer.targets };
}

function buildLoadingPage(pageNumber) {
  const footer = buildFooterRow();
  const lines = [pageHeaderRow(pageNumber, "LOADING")];
  lines.push([]);
  lines.push([run("=".repeat(COLS), "yellow")]);
  lines.push([]);
  lines.push([run(centerText("FETCHING LATEST DATA", COLS), "cyan")]);
  lines.push([run(centerText("PLEASE STAND BY", COLS), "white")]);
  lines.push([]);
  lines.push([run("=".repeat(COLS), "yellow")]);
  while (lines.length < ROWS - 1) lines.push([]);
  lines.push(footer.runs);

  return { page: pageNumber, lines: lines.slice(0, ROWS), footerTargets: footer.targets };
}

function buildNotFoundPage(pageNumber) {
  const footer = buildFooterRow();
  const lines = [pageHeaderRow(pageNumber, "")];
  lines.push([]);
  lines.push([run("=".repeat(COLS), "red")]);
  lines.push([]);
  lines.push([run(centerText(`PAGE ${pageNumber}`, COLS), "white")]);
  lines.push([run(centerText("NOT AVAILABLE", COLS), "red")]);
  lines.push([]);
  lines.push([run(centerText("Press 100 for the index", COLS), "white")]);
  lines.push([]);
  lines.push([run("=".repeat(COLS), "red")]);
  while (lines.length < ROWS - 1) lines.push([]);
  lines.push(footer.runs);

  return { page: pageNumber, lines: lines.slice(0, ROWS), footerTargets: footer.targets };
}

let grid = null;
let readoutEl = null;
let favoriteEl = null;
let beepToggleBtn = null;
let pauseToggleBtn = null;

let currentPage = 100;
let currentPageData = null;
let inputBuffer = "";
let inputResetTimer = null;
let rotationTimer = null;
let clockTimer = null;
let headerClockTimer = null;

let favorites = [];
let history = [];
let beepEnabled = false;
let rotationPaused = false;
let audioCtx = null;
let selectedIndex = 0;

function paintHeaderClock() {
  if (!grid) return;
  const now = new Date();
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const startCol = COLS - HEADER_CLOCK_WIDTH;
  for (let i = 0; i < HEADER_CLOCK_WIDTH; i++) {
    const cell = grid.children[startCol + i];
    cell.textContent = timeStr[i] || " ";
    cell.className = "cell fg-cyan";
  }
}

function paintPage(pageData) {
  renderPage(grid, pageData);
  grid.classList.toggle("compact-text", !!pageData.compact);
  paintHeaderClock();
}

function startHeaderClock() {
  paintHeaderClock();
  headerClockTimer = setInterval(paintHeaderClock, 1000);
}

function selectionMarkerCell(index) {
  const items = currentPageData && currentPageData.selectableItems;
  if (!items || !items[index]) return null;
  return grid.children[items[index].row * COLS];
}

function setSelectedIndex(newIndex) {
  const prevCell = selectionMarkerCell(selectedIndex);
  if (prevCell) prevCell.textContent = " ";
  selectedIndex = newIndex;
  const cell = selectionMarkerCell(selectedIndex);
  if (cell) {
    cell.textContent = ">";
    cell.className = "cell fg-green";
  }
}

function moveSelection(delta) {
  const items = currentPageData && currentPageData.selectableItems;
  if (!items || items.length === 0) return;
  setSelectedIndex((selectedIndex + delta + items.length) % items.length);
}

function activateSelection() {
  const items = currentPageData && currentPageData.selectableItems;
  if (!items || !items[selectedIndex]) return;
  navigateTo(items[selectedIndex].page);
}

function playBeep() {
  if (!beepEnabled) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (err) {
    console.error("Ceefax: beep failed", err);
  }
}

function updateReadout() {
  if (!inputBuffer) {
    readoutEl.hidden = true;
    return;
  }
  readoutEl.hidden = false;
  readoutEl.textContent = inputBuffer.padEnd(3, "_");
}

function isFavorite(pageNumber) {
  return favorites.includes(pageNumber);
}

function updateFavoriteIndicator() {
  favoriteEl.textContent = isFavorite(currentPage) ? "★" : "";
}

async function toggleFavorite() {
  favorites = isFavorite(currentPage)
    ? favorites.filter((p) => p !== currentPage)
    : [...favorites, currentPage];
  updateFavoriteIndicator();
  try {
    await browser.storage.local.set({ favorites });
  } catch (err) {
    console.error("Ceefax: saving favorites failed", err);
  }
}

async function persistHistory() {
  try {
    await browser.storage.local.set({ history });
  } catch (err) {
    console.error("Ceefax: saving history failed", err);
  }
}

function pushHistory(pageNumber) {
  if (history[history.length - 1] === pageNumber) return;
  history = [...history, pageNumber].slice(-HISTORY_MAX);
  persistHistory();
}

function goBack() {
  if (history.length < 2) return;
  history = history.slice(0, -1);
  const previous = history[history.length - 1];
  navigateTo(previous, { skipHistory: true });
}

function scheduleRotation() {
  clearTimeout(rotationTimer);
  if (rotationPaused) return;
  const group = currentPageData && currentPageData.subpages;
  if (!group || group.length < 2) return;
  rotationTimer = setTimeout(advanceRotation, ROTATE_MS);
}

function advanceRotation() {
  const group = currentPageData && currentPageData.subpages;
  if (!group || group.length < 2) return;
  const idx = group.indexOf(currentPage);
  const next = group[(idx + 1) % group.length];
  navigateTo(next);
}

function resumeRotationIfEligible() {
  if (!inputBuffer) scheduleRotation();
}

function stopClockTicker() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

function startClockTicker() {
  stopClockTicker();
  clockTimer = setInterval(() => {
    currentPageData = buildClockPage();
    paintPage(currentPageData);
  }, 1000);
}

async function resolvePage(pageNumber) {
  if (pageNumber === 100) return page100Template();
  if (pageNumber === 800) return buildClockPage();
  try {
    const stored = await browser.storage.local.get(["pages", "lastUpdated"]);
    const pages = stored.pages;
    if (pages && pages[pageNumber]) return pages[pageNumber];
    if (KNOWN_DYNAMIC_PAGES.has(pageNumber) && !stored.lastUpdated) {
      return buildLoadingPage(pageNumber);
    }
  } catch (err) {
    console.error("Ceefax: storage read failed", err);
  }
  return buildNotFoundPage(pageNumber);
}

async function navigateTo(pageNumber, opts = {}) {
  const isPageChange = pageNumber !== currentPage;
  clearTimeout(rotationTimer);
  stopClockTicker();
  currentPage = pageNumber;
  currentPageData = await resolvePage(pageNumber);
  paintPage(currentPageData);
  selectedIndex = 0;
  const firstCell = selectionMarkerCell(0);
  if (firstCell) {
    firstCell.textContent = ">";
    firstCell.className = "cell fg-green";
  }
  if (pageNumber === 800) startClockTicker();
  scheduleRotation();
  updateFavoriteIndicator();
  if (!opts.skipHistory) pushHistory(pageNumber);
  if (isPageChange) playBeep();
}

function handleDigit(digit) {
  clearTimeout(rotationTimer);
  inputBuffer += digit;
  updateReadout();
  clearTimeout(inputResetTimer);
  if (inputBuffer.length >= 3) {
    const pageNumber = parseInt(inputBuffer, 10);
    inputBuffer = "";
    updateReadout();
    navigateTo(pageNumber);
  } else {
    inputResetTimer = setTimeout(clearInputBuffer, INPUT_RESET_MS);
  }
}

function clearInputBuffer() {
  inputBuffer = "";
  updateReadout();
  clearTimeout(inputResetTimer);
  resumeRotationIfEligible();
}

function handleKeydown(e) {
  if (/^[0-9]$/.test(e.key)) {
    handleDigit(e.key);
  } else if (e.key === "Backspace") {
    if (inputBuffer) {
      clearInputBuffer();
    } else {
      goBack();
    }
  } else if (e.key === "Escape") {
    clearInputBuffer();
  } else if (e.key === "f" || e.key === "F") {
    toggleFavorite();
  } else if (e.key === "ArrowUp") {
    moveSelection(-1);
  } else if (e.key === "ArrowDown") {
    moveSelection(1);
  } else if (e.key === "Enter") {
    if (!inputBuffer) activateSelection();
  }
}

function handleGridClick(e) {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  if (Number(cell.dataset.row) !== ROWS - 1) return;
  const targets = currentPageData && currentPageData.footerTargets;
  if (!targets || targets.length === 0) return;
  const col = Number(cell.dataset.col);
  const bandWidth = COLS / targets.length;
  const idx = Math.min(targets.length - 1, Math.floor(col / bandWidth));
  navigateTo(targets[idx]);
}

function createReadout() {
  readoutEl = document.createElement("div");
  readoutEl.className = "page-readout";
  readoutEl.hidden = true;
  grid.parentElement.appendChild(readoutEl);
}

function createFavoriteIndicator() {
  favoriteEl = document.createElement("div");
  favoriteEl.className = "favorite-indicator";
  favoriteEl.title = "Press F to toggle favorite";
  grid.parentElement.appendChild(favoriteEl);
}

function createNumpad() {
  const pad = document.createElement("div");
  pad.className = "numpad";
  for (let d = 0; d <= 9; d++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "numpad-btn";
    btn.textContent = String(d);
    btn.addEventListener("click", () => handleDigit(String(d)));
    pad.appendChild(btn);
  }
  grid.parentElement.appendChild(pad);
}

function updateBeepToggleLabel() {
  beepToggleBtn.textContent = `BEEP: ${beepEnabled ? "ON" : "OFF"}`;
}

function createBeepToggle() {
  beepToggleBtn = document.createElement("button");
  beepToggleBtn.type = "button";
  beepToggleBtn.className = "beep-toggle";
  beepToggleBtn.addEventListener("click", async () => {
    beepEnabled = !beepEnabled;
    updateBeepToggleLabel();
    try {
      await browser.storage.local.set({ beepEnabled });
    } catch (err) {
      console.error("Ceefax: saving beep preference failed", err);
    }
  });
  grid.parentElement.appendChild(beepToggleBtn);
}

function updatePauseToggleLabel() {
  pauseToggleBtn.textContent = `ROTATE: ${rotationPaused ? "PAUSED" : "ON"}`;
}

function createRotationControls() {
  pauseToggleBtn = document.createElement("button");
  pauseToggleBtn.type = "button";
  pauseToggleBtn.className = "pause-toggle";
  pauseToggleBtn.addEventListener("click", async () => {
    rotationPaused = !rotationPaused;
    updatePauseToggleLabel();
    if (rotationPaused) {
      clearTimeout(rotationTimer);
    } else {
      scheduleRotation();
    }
    try {
      await browser.storage.local.set({ rotationPaused });
    } catch (err) {
      console.error("Ceefax: saving rotation-paused preference failed", err);
    }
  });
  grid.parentElement.appendChild(pauseToggleBtn);

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "next-page-btn";
  nextBtn.textContent = "NEXT PAGE";
  nextBtn.addEventListener("click", () => advanceRotation());
  grid.parentElement.appendChild(nextBtn);
}

export async function initNav(gridEl) {
  grid = gridEl;
  createReadout();
  createFavoriteIndicator();
  createNumpad();
  createBeepToggle();
  createRotationControls();

  try {
    const stored = await browser.storage.local.get(["favorites", "history", "beepEnabled", "rotationPaused"]);
    favorites = stored.favorites || [];
    history = stored.history || [];
    beepEnabled = !!stored.beepEnabled;
    rotationPaused = !!stored.rotationPaused;
  } catch (err) {
    console.error("Ceefax: loading nav state failed", err);
  }
  updateBeepToggleLabel();
  updatePauseToggleLabel();

  window.addEventListener("keydown", handleKeydown);
  grid.addEventListener("click", handleGridClick);
  startHeaderClock();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.pages) return;
    if (currentPage === 100 || currentPage === 800) return;
    const updated = changes.pages.newValue;
    if (updated && updated[currentPage]) {
      currentPageData = updated[currentPage];
      paintPage(currentPageData);
      scheduleRotation();
    }
  });

  await navigateTo(100);
}
