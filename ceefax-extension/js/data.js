const COLS = 40;
const ROWS = 25;

// Row 0 of every page reserves its trailing 8 columns for nav.js's live
// header clock overlay, which repaints them every second regardless of
// page content - keep this in sync with HEADER_CLOCK_WIDTH in nav.js.
const HEADER_CLOCK_WIDTH = 8;
const HEADER_SAFE_WIDTH = COLS - HEADER_CLOCK_WIDTH - 1;

// Also referenced directly by background.js (same global scope - see
// manifest.json's background.scripts load order).
//
// Three-tier page scheme per topic, mirroring the weather hub/city/day-detail
// nesting: topic.base = subcategory hub, base+1..+3 = subcategory headline
// lists (one per entry in `subcategories`, in order), base+4..+12 = that
// topic's 9 articles (3 per subcategory, grouped in subcategory order - see
// subcategoryPage()/subcategoryArticlePage() below). Bases are spaced 15
// apart (13 slots used, 2 spare) so no topic's range reaches the next one -
// keep it that way if subcategory/article counts ever change.
const NEWS_TOPICS = [
  {
    name: "World news",
    base: 110,
    subcategories: [
      { name: "Europe", url: "https://www.theguardian.com/world/europe-news/rss" },
      { name: "Americas", url: "https://www.theguardian.com/world/americas/rss" },
      { name: "Asia", url: "https://www.theguardian.com/world/asia/rss" },
    ],
  },
  {
    name: "UK news",
    base: 125,
    subcategories: [
      { name: "Politics", url: "https://www.theguardian.com/politics/rss" },
      { name: "Education", url: "https://www.theguardian.com/education/rss" },
      { name: "Society", url: "https://www.theguardian.com/society/rss" },
    ],
  },
  {
    name: "Business",
    base: 140,
    subcategories: [
      { name: "Economics", url: "https://www.theguardian.com/business/economics/rss" },
      { name: "Banking", url: "https://www.theguardian.com/business/banking/rss" },
      { name: "Markets", url: "https://www.theguardian.com/business/stock-markets/rss" },
    ],
  },
  {
    name: "Technology",
    base: 155,
    subcategories: [
      { name: "Internet", url: "https://www.theguardian.com/technology/internet/rss" },
      { name: "Games", url: "https://www.theguardian.com/games/rss" },
      { name: "Mobile phones", url: "https://www.theguardian.com/technology/mobilephones/rss" },
    ],
  },
  {
    name: "Sport",
    base: 170,
    subcategories: [
      { name: "Football", url: "https://www.theguardian.com/football/rss" },
      { name: "Cricket", url: "https://www.theguardian.com/sport/cricket/rss" },
      { name: "Rugby union", url: "https://www.theguardian.com/sport/rugby-union/rss" },
    ],
  },
  {
    name: "Science",
    base: 185,
    subcategories: [
      { name: "Space", url: "https://www.theguardian.com/science/space/rss" },
      { name: "Physics", url: "https://www.theguardian.com/science/physics/rss" },
      { name: "Genetics", url: "https://www.theguardian.com/science/genetics/rss" },
    ],
  },
];
const ARTICLES_PER_SUBCATEGORY = 3;

function subcategoryPage(topic, subIndex) {
  return topic.base + subIndex + 1;
}

function subcategoryArticlePage(topic, subIndex, articleIndex) {
  return topic.base + 4 + subIndex * ARTICLES_PER_SUBCATEGORY + articleIndex;
}

const WEATHER_CITIES = [
  { name: "Auckland", latitude: -36.8485, longitude: 174.7633, timezone: "Pacific/Auckland", base: 210 },
  { name: "Toronto", latitude: 43.6532, longitude: -79.3832, timezone: "America/Toronto", base: 220 },
  { name: "London", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London", base: 230 },
  { name: "Santa Barbara", latitude: 34.4208, longitude: -119.6982, timezone: "America/Los_Angeles", base: 240 },
  { name: "Sydney", latitude: -33.8688, longitude: 151.2093, timezone: "Australia/Sydney", base: 250 },
  { name: "Wellington", latitude: -41.2865, longitude: 174.7762, timezone: "Pacific/Auckland", base: 260 },
];

const REDDIT_SUBREDDITS = [
  { slug: "newzealand", page: 401 },
  { slug: "auckland", page: 402 },
  { slug: "casualUK", page: 403 },
  { slug: "SipsTea", page: 404 },
  { slug: "WhitePeopleTwitter", page: 405 },
  { slug: "WorldNews", page: 406 },
  { slug: "TodayILearned", page: 407 },
  { slug: "InterestingAsFuck", page: 408 },
  { slug: "SantaBarbara", page: 409 },
];

const WMO_DESCRIPTIONS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm, slight hail",
  99: "Thunderstorm, heavy hail",
};

function wmoDescription(code) {
  return WMO_DESCRIPTIONS[code] || "Unknown";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function wrapText(text, width) {
  width = width || COLS;
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += width) {
        lines.push(word.slice(i, i + width));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncateLines(lines, maxLines) {
  if (lines.length <= maxLines) return lines;
  const truncated = lines.slice(0, maxLines);
  const last = truncated[maxLines - 1];
  truncated[maxLines - 1] = last.length < COLS ? `${last}…` : `${last.slice(0, COLS - 1)}…`;
  return truncated;
}

function parseRssFeed(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const items = Array.from(doc.querySelectorAll("item"));
  return items.map((item) => ({
    title: (item.querySelector("title")?.textContent || "").trim(),
    link: (item.querySelector("link")?.textContent || "").trim(),
    description: (item.querySelector("description")?.textContent || "").trim(),
    pubDate: (item.querySelector("pubDate")?.textContent || "").trim(),
  }));
}

// old.reddit.com's /.rss feeds are Atom, not RSS 2.0: entries (not items),
// and <link href="..."> is an attribute, not text content.
function parseRedditFeed(atomText) {
  const doc = new DOMParser().parseFromString(atomText, "application/xml");
  const entries = Array.from(doc.querySelectorAll("entry"));
  return entries.map((entry) => {
    const linkEl = entry.querySelector("link");
    return {
      title: (entry.querySelector("title")?.textContent || "").trim(),
      link: linkEl ? linkEl.getAttribute("href") || "" : "",
    };
  });
}

function run(text, color) {
  return { text, color };
}

function pageHeaderRow(pageNumber, title) {
  const prefix = `P${pageNumber}  CEEFAX`;
  const remaining = Math.max(0, HEADER_SAFE_WIDTH - prefix.length);
  const titleRun = title ? `  ${title}`.slice(0, remaining) : "";
  return [run(`P${pageNumber}`, "white"), run("  CEEFAX", "cyan"), run(titleRun, "yellow")];
}

// Dynamic FastText-style footer: always 4 colored links, excluding whichever
// top-level section the current page belongs to. Mirrored in nav.js (which
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

function buildNewsHubPage() {
  const lines = [pageHeaderRow(101, "NEWS")];
  lines.push([]);
  lines.push([run(" Select a topic:", "yellow")]);
  lines.push([]);
  const selectableItems = [];
  for (const topic of NEWS_TOPICS) {
    selectableItems.push({ row: lines.length, page: topic.base });
    lines.push([run(` ${topic.base}`, "cyan"), run(` ${topic.name}`, "white")]);
  }

  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(101);
  lines.push(footer.runs);

  return { page: 101, lines: lines.slice(0, ROWS), footerTargets: footer.targets, selectableItems };
}

function buildTopicHubPage(topic) {
  const lines = [pageHeaderRow(topic.base, topic.name.toUpperCase())];
  lines.push([]);
  lines.push([run(" Select a category:", "yellow")]);
  lines.push([]);
  const selectableItems = [];
  topic.subcategories.forEach((sub, subIndex) => {
    const pageNum = subcategoryPage(topic, subIndex);
    selectableItems.push({ row: lines.length, page: pageNum });
    lines.push([run(` ${pageNum}`, "cyan"), run(` ${sub.name}`, "white")]);
  });

  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(101);
  lines.push(footer.runs);

  return { page: topic.base, lines: lines.slice(0, ROWS), footerTargets: footer.targets, selectableItems };
}

function buildSubcategoryHeadlinesPage(topic, sub, subIndex, items) {
  const pageNum = subcategoryPage(topic, subIndex);
  const lines = [pageHeaderRow(pageNum, sub.name.toUpperCase())];
  lines.push([]);
  const selectableItems = [];

  const maxEntries = Math.min(items.length, ARTICLES_PER_SUBCATEGORY);
  for (let i = 0; i < maxEntries; i++) {
    if (lines.length >= ROWS - 1) break;
    const articlePageNum = subcategoryArticlePage(topic, subIndex, i);
    const prefix = ` ${articlePageNum} `;
    const wrapped = wrapText(items[i].title, COLS - prefix.length);
    selectableItems.push({ row: lines.length, page: articlePageNum });
    for (let w = 0; w < wrapped.length && lines.length < ROWS - 1; w++) {
      const linePrefix = w === 0 ? prefix : " ".repeat(prefix.length);
      lines.push([run(linePrefix, "cyan"), run(wrapped[w], "white")]);
    }
    if (lines.length < ROWS - 1) lines.push([]);
  }

  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(101);
  lines.push(footer.runs);

  return { page: pageNum, lines: lines.slice(0, ROWS), footerTargets: footer.targets, compact: true, selectableItems };
}

function buildArticlePage(pageNum, item, articleText) {
  const bodyRows = ROWS - 3;
  const wrapped = truncateLines(wrapText(articleText, COLS), bodyRows);

  const maxTitleLen = Math.max(0, HEADER_SAFE_WIDTH - `P${pageNum}  `.length);

  const lines = [
    [run(`P${pageNum}`, "white"), run("  ", "white"), run(item.title.slice(0, maxTitleLen), "yellow")],
  ];
  for (const line of wrapped) {
    lines.push([run(line, "white")]);
  }
  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(101);
  lines.push(footer.runs);

  return { page: pageNum, lines: lines.slice(0, ROWS), footerTargets: footer.targets };
}

function buildWeatherHubPage() {
  const lines = [pageHeaderRow(200, "WEATHER")];
  lines.push([]);
  lines.push([run(" Select a city:", "yellow")]);
  lines.push([]);
  const selectableItems = [];
  for (const city of WEATHER_CITIES) {
    selectableItems.push({ row: lines.length, page: city.base });
    lines.push([run(` ${city.base}`, "cyan"), run(` ${city.name}`, "white")]);
  }

  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(200);
  lines.push(footer.runs);

  return { page: 200, lines: lines.slice(0, ROWS), footerTargets: footer.targets, selectableItems };
}

function buildCityOverviewPage(city, weatherJson) {
  const lines = [pageHeaderRow(city.base, city.name.toUpperCase())];
  lines.push([]);

  const current = weatherJson.current || {};
  if (current.temperature_2m != null) {
    lines.push([
      run(" Now: ", "white"),
      run(`${Math.round(current.temperature_2m)}C`, "cyan"),
      run(` ${wmoDescription(current.weather_code)}`, "white"),
    ]);
    lines.push([]);
  }

  lines.push([run(" 7-day forecast (select a day):", "yellow")]);
  const daily = weatherJson.daily || {};
  const days = daily.time || [];
  const selectableItems = [];
  for (let i = 0; i < days.length; i++) {
    const pageNum = city.base + i + 1;
    const max = Math.round(daily.temperature_2m_max[i]);
    const min = Math.round(daily.temperature_2m_min[i]);
    const desc = wmoDescription(daily.weather_code[i]);
    selectableItems.push({ row: lines.length, page: pageNum });
    lines.push([
      run(` ${pageNum}`, "cyan"),
      run(` ${days[i]}`, "white"),
      run(`  ${min}-${max}C`, "cyan"),
      run(` ${desc}`, "white"),
    ]);
  }

  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(200);
  lines.push(footer.runs);

  return { page: city.base, lines: lines.slice(0, ROWS), footerTargets: footer.targets, selectableItems };
}

function findHourlyIndex(hourlyTimes, dateStr, hour) {
  return hourlyTimes.indexOf(`${dateStr}T${pad2(hour)}:00`);
}

function buildDayDetailPage(city, dayIndex, weatherJson) {
  const pageNum = city.base + dayIndex + 1;
  const daily = weatherJson.daily || {};
  const hourly = weatherJson.hourly || {};
  const dateStr = (daily.time || [])[dayIndex] || "";
  const hourlyTimes = hourly.time || [];

  const lines = [pageHeaderRow(pageNum, city.name.toUpperCase())];
  lines.push([]);
  lines.push([run(` ${dateStr}`, "white")]);
  lines.push([]);

  const periods = [
    { label: "Morning", hour: 9 },
    { label: "Day", hour: 15 },
    { label: "Night", hour: 21 },
  ];
  for (const period of periods) {
    const idx = findHourlyIndex(hourlyTimes, dateStr, period.hour);
    if (idx === -1 || !hourly.temperature_2m) {
      lines.push([run(` ${period.label}: no data`, "white")]);
    } else {
      const temp = Math.round(hourly.temperature_2m[idx]);
      const desc = wmoDescription(hourly.weather_code[idx]);
      lines.push([
        run(` ${period.label}:`.padEnd(10), "yellow"),
        run(`${temp}C`, "cyan"),
        run(` ${desc}`, "white"),
      ]);
    }
    lines.push([]);
  }

  lines.push([run(` ${city.base} Back to ${city.name} forecast`, "cyan")]);

  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(200);
  lines.push(footer.runs);

  return { page: pageNum, lines: lines.slice(0, ROWS), footerTargets: footer.targets };
}

function buildTickerPage(items) {
  const tickerText = items.map((item) => item.title).join("   ***   ");
  const lines = [pageHeaderRow(300, "TICKER")];
  lines.push([]);

  const wrapped = wrapText(tickerText, COLS).slice(0, ROWS - 4);
  for (const line of wrapped) {
    lines.push([run(line, "white")]);
  }

  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(300);
  lines.push(footer.runs);

  return { page: 300, tickerText, lines: lines.slice(0, ROWS), footerTargets: footer.targets };
}

function buildRedditHubPage() {
  const lines = [pageHeaderRow(400, "REDDIT")];
  lines.push([]);
  lines.push([run(" Select a subreddit:", "yellow")]);
  lines.push([]);
  const selectableItems = [];
  for (const sub of REDDIT_SUBREDDITS) {
    selectableItems.push({ row: lines.length, page: sub.page });
    lines.push([run(` ${sub.page}`, "cyan"), run(` r/${sub.slug}`, "white")]);
  }

  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(400);
  lines.push(footer.runs);

  return { page: 400, lines: lines.slice(0, ROWS), footerTargets: footer.targets, selectableItems };
}

function buildSubredditPage(sub, entries) {
  const lines = [pageHeaderRow(sub.page, `R/${sub.slug.toUpperCase()}`)];
  lines.push([]);
  const selectableItems = [];

  const maxEntries = Math.min(entries.length, 20);
  for (let i = 0; i < maxEntries; i++) {
    if (lines.length >= ROWS - 1) break;
    const wrapped = wrapText(entries[i].title, COLS - 3);
    // No internal page number - Enter on a post opens its real reddit.com
    // permalink in a new tab (see nav.js's activateSelection) rather than
    // fetching full post text, per the earlier scope decision to skip
    // per-post extraction (project.md, 2026-07-13).
    selectableItems.push({ row: lines.length, url: entries[i].link });
    for (let w = 0; w < wrapped.length && lines.length < ROWS - 1; w++) {
      const linePrefix = w === 0 ? " * " : "   ";
      lines.push([run(linePrefix, "cyan"), run(wrapped[w], "white")]);
    }
    if (lines.length < ROWS - 1) lines.push([]);
  }

  while (lines.length < ROWS - 1) lines.push([]);
  const footer = buildFooterRow(400);
  lines.push(footer.runs);

  return { page: sub.page, lines: lines.slice(0, ROWS), footerTargets: footer.targets, compact: true, selectableItems };
}
