const REFRESH_ALARM = "ceefax-refresh";
const REFRESH_PERIOD_MINUTES = 15;

// old.reddit.com rate-limits by IP, not by subreddit: live testing (2026-07-14)
// showed x-ratelimit-remaining drop to 0 after a single request to ANY
// endpoint, resetting ~44-60s later. At the old 800ms gap, only the first of
// 9 sequential requests could ever succeed. 65s keeps every request outside
// the observed window; worst case (8 delays) is ~8.7 min, still comfortably
// inside the 15-minute refresh cycle.
const REDDIT_FETCH_DELAY_MS = 65000;

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
  const allItems = [];

  for (const topic of NEWS_TOPICS) {
    for (let subIndex = 0; subIndex < topic.subcategories.length; subIndex++) {
      const sub = topic.subcategories[subIndex];
      let items = [];
      try {
        const rssRes = await fetch(sub.url);
        if (!rssRes.ok) throw new Error(`HTTP ${rssRes.status}`);
        const xmlText = await rssRes.text();
        items = parseRssFeed(xmlText);
      } catch (err) {
        console.error(`Ceefax: RSS fetch failed for ${topic.name}/${sub.name}`, err);
      }
      if (items.length === 0) continue;
      allItems.push(...items);

      const subItems = items.slice(0, ARTICLES_PER_SUBCATEGORY);
      const subPage = subcategoryPage(topic, subIndex);
      const subGroup = [subPage, ...subItems.map((_, i) => subcategoryArticlePage(topic, subIndex, i))];

      pages[subPage] = { ...buildSubcategoryHeadlinesPage(topic, sub, subIndex, subItems), subpages: subGroup };
      for (let i = 0; i < subItems.length; i++) {
        const item = subItems[i];
        const pageNum = subcategoryArticlePage(topic, subIndex, i);
        try {
          const articleText = await fetchArticleText(item.link);
          pages[pageNum] = { ...buildArticlePage(pageNum, item, articleText || item.description), subpages: subGroup };
        } catch (err) {
          console.error(`Ceefax: article fetch failed for ${item.link}`, err);
          pages[pageNum] = { ...buildArticlePage(pageNum, item, item.description), subpages: subGroup };
        }
      }
    }
    pages[topic.base] = buildTopicHubPage(topic);
  }

  if (allItems.length > 0) pages[300] = buildTickerPage(allItems);
  pages[101] = buildNewsHubPage();
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

// Persists each subreddit as soon as it's fetched, rather than batching all
// 9 into one write at the end - the 65s/subreddit pacing this needs to
// dodge reddit's per-IP rate limit means the last subreddit wouldn't appear
// until ~8.7 min in otherwise, even though most finish much sooner.
async function refreshReddit() {
  let anyPages = false;
  for (let i = 0; i < REDDIT_SUBREDDITS.length; i++) {
    const sub = REDDIT_SUBREDDITS[i];
    try {
      const res = await fetch(`https://old.reddit.com/r/${sub.slug}/.rss`);
      // A 429 still resolves (doesn't reject) with an empty/non-feed body -
      // without this check, parseRedditFeed would silently return zero
      // entries and overwrite a previously-good page with an empty one.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const atomText = await res.text();
      const entries = parseRedditFeed(atomText);
      if (await persistPages({ [sub.page]: buildSubredditPage(sub, entries) })) anyPages = true;
    } catch (err) {
      console.error(`Ceefax: reddit fetch failed for r/${sub.slug}`, err);
    }
    if (i < REDDIT_SUBREDDITS.length - 1) await sleep(REDDIT_FETCH_DELAY_MS);
  }
  if (await persistPages({ 400: buildRedditHubPage() })) anyPages = true;
  return anyPages;
}

async function persistPages(newPages) {
  if (Object.keys(newPages).length === 0) return false;
  const { pages: existing } = await browser.storage.local.get("pages");
  await browser.storage.local.set({ pages: { ...(existing || {}), ...newPages } });
  return true;
}

async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  try {
    // Persisted per section, not once at the end - reddit's own fetch
    // pacing (65s/subreddit, ~8.7 min worst case) would otherwise hold
    // news and weather's already-ready content hostage behind it, leaving
    // every page showing "FETCHING LATEST DATA" for minutes after every
    // refresh instead of just the still-pending reddit pages.
    let anyPages = false;

    const newsPages = {};
    await refreshNews(newsPages);
    if (await persistPages(newsPages)) anyPages = true;

    const weatherPages = {};
    await refreshWeather(weatherPages);
    if (await persistPages(weatherPages)) anyPages = true;

    if (await refreshReddit()) anyPages = true;

    if (anyPages) await browser.storage.local.set({ lastUpdated: Date.now() });
  } finally {
    refreshing = false;
  }
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) refreshAll();
});

// Run unconditionally at script load rather than only inside onInstalled/
// onStartup - those don't reliably both fire for every way this script can
// (re)start (e.g. clicking "Reload" on an already-loaded temporary add-on in
// about:debugging), which left the fetch pipeline never kicking off at all.
browser.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_PERIOD_MINUTES });
refreshAll();
