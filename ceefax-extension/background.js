const RSS_FEED_URL = "https://www.theguardian.com/uk/rss";

const ARTICLE_PAGE_START = 102;
const ARTICLE_COUNT = 5;

const REFRESH_ALARM = "ceefax-refresh";
const REFRESH_PERIOD_MINUTES = 15;

const REDDIT_FETCH_DELAY_MS = 800;

let refreshing = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function weatherUrl(city) {
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}` +
    "&current=temperature_2m,weather_code,wind_speed_10m" +
    "&daily=temperature_2m_max,temperature_2m_min,weather_code" +
    "&hourly=temperature_2m,weather_code" +
    `&timezone=${encodeURIComponent(city.timezone)}&forecast_days=7`
  );
}

async function fetchArticleText(url) {
  const res = await fetch(url);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const reader = new Readability(doc);
  const article = reader.parse();
  return article ? article.textContent : "";
}

async function refreshNews(pages) {
  let items = [];
  try {
    const rssRes = await fetch(RSS_FEED_URL);
    const xmlText = await rssRes.text();
    items = parseRssFeed(xmlText);
  } catch (err) {
    console.error("Ceefax: RSS fetch failed", err);
  }

  if (items.length === 0) return;

  pages[300] = buildTickerPage(items);

  const articleItems = items.slice(0, ARTICLE_COUNT);
  const newsGroup = [101, ...articleItems.map((_, i) => ARTICLE_PAGE_START + i)];

  pages[101] = { ...buildHeadlinesPage(items, ARTICLE_PAGE_START), subpages: newsGroup };
  for (let i = 0; i < articleItems.length; i++) {
    const item = articleItems[i];
    const pageNum = ARTICLE_PAGE_START + i;
    try {
      const articleText = await fetchArticleText(item.link);
      pages[pageNum] = { ...buildArticlePage(pageNum, item, articleText || item.description), subpages: newsGroup };
    } catch (err) {
      console.error(`Ceefax: article fetch failed for ${item.link}`, err);
      pages[pageNum] = { ...buildArticlePage(pageNum, item, item.description), subpages: newsGroup };
    }
  }
}

async function refreshWeather(pages) {
  for (const city of WEATHER_CITIES) {
    try {
      const res = await fetch(weatherUrl(city));
      const weatherJson = await res.json();
      pages[city.base] = buildCityOverviewPage(city, weatherJson);
      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const pageNum = city.base + dayIndex + 1;
        pages[pageNum] = buildDayDetailPage(city, dayIndex, weatherJson);
      }
    } catch (err) {
      console.error(`Ceefax: weather fetch failed for ${city.name}`, err);
    }
  }
  pages[200] = buildWeatherHubPage();
}

async function refreshReddit(pages) {
  for (const sub of REDDIT_SUBREDDITS) {
    try {
      const res = await fetch(`https://old.reddit.com/r/${sub.slug}/.rss`);
      const atomText = await res.text();
      const entries = parseRedditFeed(atomText);
      pages[sub.page] = buildSubredditPage(sub, entries);
    } catch (err) {
      console.error(`Ceefax: reddit fetch failed for r/${sub.slug}`, err);
    }
    await sleep(REDDIT_FETCH_DELAY_MS);
  }
  pages[400] = buildRedditHubPage();
}

async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  try {
    const pages = {};

    await refreshNews(pages);
    await refreshWeather(pages);
    await refreshReddit(pages);

    if (Object.keys(pages).length > 0) {
      const { pages: existing } = await browser.storage.local.get("pages");
      await browser.storage.local.set({
        pages: { ...(existing || {}), ...pages },
        lastUpdated: Date.now(),
      });
    }
  } finally {
    refreshing = false;
  }
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) refreshAll();
});

// Run unconditionally at script load rather than only inside onInstalled/
// onStartup — those don't reliably both fire for every way this script can
// (re)start (e.g. clicking "Reload" on an already-loaded temporary add-on in
// about:debugging), which left the fetch pipeline never kicking off at all.
browser.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_PERIOD_MINUTES });
refreshAll();
