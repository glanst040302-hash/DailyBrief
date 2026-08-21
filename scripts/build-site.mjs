#!/usr/bin/env node
/**
 * Build the static site that gets published to GitHub Pages (or any static
 * host). Run AFTER `npm run daily` has produced today's report.
 *
 * Writes into daily_reports/ (already the publish dir):
 *   - index.html      copy of the latest <date>/<date>.html
 *   - archive.html    table of every <date>/<date>.html, newest first
 *
 * Existing per-date subdirs are left untouched. Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/build-site.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { buildRollingReview } from "./rolling-review.mjs";
import { renderTimelinePage } from "./timeline-page.mjs";

const ROOT = "daily_reports";

if (!fs.existsSync(ROOT)) {
  console.error(`[build-site] ${ROOT}/ doesn't exist — run \`npm run daily\` first.`);
  process.exit(1);
}

// Pick up every <YYYY-MM-DD>/<YYYY-MM-DD>.html, newest first.
const dates = fs
  .readdirSync(ROOT)
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  .filter((d) => fs.existsSync(path.join(ROOT, d, `${d}.html`)))
  .sort((a, b) => b.localeCompare(a));

if (dates.length === 0) {
  console.error(`[build-site] no <YYYY-MM-DD>/<YYYY-MM-DD>.html found in ${ROOT}/`);
  process.exit(1);
}

// --- index.html = latest report ---
const latest = dates[0];
const latestPath = path.join(ROOT, latest, `${latest}.html`);
const reports = dates.slice(0, 30).flatMap((date) => {
  const jsonPath = path.join(ROOT, date, `${date}.json`);
  try {
    return [{ date, report: JSON.parse(fs.readFileSync(jsonPath, "utf8")) }];
  } catch {
    return [];
  }
});

// Topic panels use every recent sidecar, not only dates that still have a
// rendered report page. This keeps the rolling topic feed intact when a
// prior daily HTML page was not retained during a publish.
const topicDates = fs
  .readdirSync(ROOT)
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  .filter((d) => fs.existsSync(path.join(ROOT, d, `${d}-articles.json`)))
  .sort((a, b) => b.localeCompare(a));

const topicArticleReports = topicDates.slice(0, 30).flatMap((date) => {
  const articlesPath = path.join(ROOT, date, `${date}-articles.json`);
  try {
    const payload = JSON.parse(fs.readFileSync(articlesPath, "utf8"));
    return (payload.articles ?? []).map((article) => ({ ...article, reportDate: date }));
  } catch {
    return [];
  }
});

const RADAR_SOURCE_PREFIXES = [
  "Google News｜触觉",
  "arXiv｜触觉",
  "The Robot Report",
  "IEEE Spectrum｜Robotics",
  "NVIDIA Robotics",
  "Google DeepMind｜Robotics",
  "Hugging Face｜机器人",
  "OpenAI News",
  "MIT Technology Review｜AI",
  "IFR｜机器人产业",
];

function isRadarSource(source) {
  return RADAR_SOURCE_PREFIXES.some((prefix) => String(source).startsWith(prefix));
}

// Reports before the intelligence-radar redesign used broad technology,
// finance and world-news sources. Keep those in the archive, but never let
// them leak into the catch-up panel.
const radarReports = reports.map(({ date, report }) => ({
  date,
  report: {
    ...report,
    tech_briefs: (report.tech_briefs ?? []).filter((brief) => isRadarSource(brief.source)),
    finance_briefs: (report.finance_briefs ?? []).filter((brief) => isRadarSource(brief.source)),
    politics_briefs: (report.politics_briefs ?? []).filter((brief) => isRadarSource(brief.source)),
  },
}));

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TOPIC_CONFIG = {
  tech: { label: "触觉产业链", defaultLimit: 4, maxItems: 20 },
  finance: { label: "机器人与具身智能", defaultLimit: 2, maxItems: 20 },
  politics: { label: "产业关键变化", defaultLimit: 2, maxItems: 20 },
};

function titleKey(title) {
  return String(title ?? "")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function freshnessScore(date) {
  const days = Math.max(0, Math.round((Date.parse(`${latest}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000));
  if (days === 0) return 10;
  if (days <= 1) return 8;
  if (days <= 3) return 5;
  if (days <= 7) return 2;
  return 0;
}

function uniqueItems(items) {
  const titles = new Set();
  const urls = new Set();
  return items.filter((item) => {
    const title = titleKey(item.title);
    if (!title || titles.has(title) || urls.has(item.url)) return false;
    titles.add(title);
    urls.add(item.url);
    return true;
  });
}

function topicItems(category, sort) {
  const key = `${category}_briefs`;
  const editorialScores = new Map(
    radarReports.flatMap(({ date, report }) =>
      (report[key] ?? []).map((brief) => [brief.url, { importance: Number(brief.importance), summary: brief.summary, date }]),
    ),
  );
  const items = topicArticleReports
    .filter((article) => article.category === category)
    .map((article) => {
      const editorial = editorialScores.get(article.url);
      const date = String(article.publishedAt ?? article.reportDate).slice(0, 10) || article.reportDate;
      return {
        ...article,
        date,
        summary: editorial?.summary ?? article.excerpt ?? "",
        importance: editorial?.importance,
      };
    });
  const sorted = [...items].sort((a, b) => {
    if (sort === "latest") {
      return b.date.localeCompare(a.date) || (Number(b.importance) || 0) - (Number(a.importance) || 0);
    }
    const aScore = (Number(a.importance) || 5) * 0.7 + freshnessScore(a.date) * 0.3;
    const bScore = (Number(b.importance) || 5) * 0.7 + freshnessScore(b.date) * 0.3;
    return bScore - aScore || b.date.localeCompare(a.date);
  });
  return uniqueItems(sorted).slice(0, TOPIC_CONFIG[category].maxItems);
}

function renderTopicCard(item, className = "") {
  const importance = Number(item.importance);
  const hasImportance = Number.isFinite(importance) && importance > 0;
  const rank = importance >= 9 ? "high" : importance >= 7 ? "mid" : "low";
  const summaryLines = String(item.summary ?? "")
    .replace(/(?:^|\s*)(?:发生了什么|为什么重要|与触觉的关系|与触觉关系|与机器人方向的关系|与触觉\/公司方向的关系)\s*[：:｜|]?\s*/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const summary = summaryLines.length >= 2
    ? `<div class="brief-summary brief-summary-lines">${summaryLines.map((line) => `<p>${esc(line)}</p>`).join("")}</div>`
    : `<p class="brief-summary">${esc(item.summary)}</p>`;
  return `<article class="brief ${className}">
  <div class="brief-head"><span class="brief-source">${esc(item.date)} · ${esc(item.source)}</span>${hasImportance ? `<span class="brief-rank ${rank}">${importance}/10</span>` : ""}</div>
  <h3 class="brief-title"><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
  ${summary}
</article>`;
}

function renderHomeTopicSection(category) {
  const config = TOPIC_CONFIG[category];
  const items = topicItems(category, "combined");
  if (items.length === 0) return "";
  return `<section class="digest-category" data-home-section="${category}" data-home-limit="${config.defaultLimit}">
  <header class="category-header">
    <h2 class="category-title"><button class="category-link" data-open-tab="${category}">${config.label}</button><span class="home-limit"><button aria-label="少显示一条" data-limit-delta="-1">−</button><span class="home-limit-value">${config.defaultLimit}</span><button aria-label="多显示一条" data-limit-delta="1">+</button></span></h2>
  </header>
  <div class="brief-list">${items.map((item) => renderTopicCard(item, "home-item")).join("\n")}</div>
</section>`;
}

function renderTopicPanel(category) {
  const config = TOPIC_CONFIG[category];
  const combined = topicItems(category, "combined");
  const latestItems = topicItems(category, "latest");
  return `<section class="topic-panel">
  <nav class="topic-toolbar" aria-label="${config.label}排序">
    <button class="topic-sort active" data-topic-sort="combined">综合</button>
    <button class="topic-sort" data-topic-sort="latest">最新</button>
  </nav>
  <div class="topic-sort-content active" data-topic-sort-content="combined"><div class="brief-list">${combined.map((item) => renderTopicCard(item)).join("\n")}</div></div>
  <div class="topic-sort-content" data-topic-sort-content="latest"><div class="brief-list">${latestItems.map((item) => renderTopicCard(item)).join("\n")}</div></div>
</section>`;
}

function renderHomeDigest() {
  const latestReport = reports.find(({ date }) => date === latest)?.report ?? {};
  return `${latestReport.hero_headline ? `<section class="hero-card"><span class="hero-eyebrow">当前焦点</span><p class="hero-headline">${esc(latestReport.hero_headline)}</p></section>` : ""}
  ${latestReport.daily_overview ? `<section class="overview-card"><span class="eyebrow">动态概览</span><p class="overview-text">${esc(latestReport.daily_overview)}</p></section>` : ""}
  ${renderHomeTopicSection("tech")}
  ${renderHomeTopicSection("finance")}
  ${renderHomeTopicSection("politics")}
  ${latestReport.editor_note ? `<section class="editor-card"><span class="eyebrow">编辑短评</span><p class="editor-text">${esc(latestReport.editor_note)}</p></section>` : ""}
  ${Array.isArray(latestReport.keywords) && latestReport.keywords.length ? `<div class="keywords">${latestReport.keywords.map((keyword) => `<span class="keyword">${esc(keyword)}</span>`).join("")}</div>` : ""}`;
}

function renderRollingReview() {
  const { weekly, trends } = buildRollingReview(radarReports, latest);
  if (weekly.length === 0 && trends.length === 0) return "";
  const weeklyCards = weekly
    .map((item) => `<article class="brief">
  <div class="brief-head"><span class="brief-source">${esc(item.date)} · ${esc(item.source)}</span><span class="brief-rank ${item.importance >= 9 ? "high" : "mid"}">${esc(item.importance)}/10</span></div>
  <h3 class="brief-title"><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
  <p class="brief-summary">${esc(item.summary)}</p>
</article>`)
    .join("\n");
  const trendCards = trends
    .map((trend) => `<article class="brief">
  <div class="brief-head"><span class="brief-source">${trend.days >= 2 ? `${trend.days} 日进入日报` : "观察中"}</span></div>
  <h3 class="brief-title">${esc(trend.topic)}</h3>
  <p class="brief-summary">最新进展：${esc(trend.latest)}</p>
</article>`)
    .join("\n");
  return `<section class="rolling-review">
  ${weekly.length ? `<section class="digest-category">
    <header class="category-header"><h2 class="category-title">近 7 日必读</h2><span class="category-count">${weekly.length}</span></header>
    <div class="brief-list">${weeklyCards}</div>
  </section>` : ""}
  ${trends.length ? `<section class="digest-category">
    <header class="category-header"><h2 class="category-title">近 30 日持续趋势</h2><span class="category-count">${trends.length}</span></header>
    <div class="brief-list">${trendCards}</div>
  </section>` : ""}
</section>`;
}

const rollingReviewHtml = renderRollingReview();
function replaceTopicTabCount(html, category) {
  const count = topicItems(category, "combined").length;
  const pattern = new RegExp(`(<button class="tab" data-tab="${category}">[^<]*<span class="count">)\\d+`, "u");
  return html.replace(pattern, `$1${count}`);
}

const latestHtml = fs
  .readFileSync(latestPath, "utf8")
  .replace(/href="\.\.\/archive\.html"/g, 'href="./archive.html"')
  .replace(
    '<button class="tab" data-tab="tech"',
    `${rollingReviewHtml ? `<button class="tab" data-tab="review">近期回顾</button>\n    ` : ""}<button class="tab" data-tab="tech"`,
  )
  .replace(
    '<section class="panel active" data-panel="digest">',
    `${rollingReviewHtml ? `<section class="panel" data-panel="review">${rollingReviewHtml}</section>\n  ` : ""}<section class="panel active" data-panel="digest">`,
  )
  .replace(/<!-- HOME_DIGEST -->[\s\S]*?<!-- \/HOME_DIGEST -->/, renderHomeDigest())
  .replace(/<!-- HOME_CATEGORY:tech -->[\s\S]*?<!-- \/HOME_CATEGORY:tech -->/, renderTopicPanel("tech"))
  .replace(/<!-- HOME_CATEGORY:finance -->[\s\S]*?<!-- \/HOME_CATEGORY:finance -->/, renderTopicPanel("finance"))
  .replace(/<!-- HOME_CATEGORY:politics -->[\s\S]*?<!-- \/HOME_CATEGORY:politics -->/, renderTopicPanel("politics"));
const latestHtmlWithTopicCounts = ["tech", "finance", "politics"].reduce(
  (html, category) => replaceTopicTabCount(html, category),
  latestHtml,
);
fs.writeFileSync(path.join(ROOT, "index.html"), latestHtmlWithTopicCounts, "utf8");
console.log(`[build-site] index.html  ← ${latest}/${latest}.html`);

const milestonePath = path.join("data", "intelligence-milestones.json");
const milestones = JSON.parse(fs.readFileSync(milestonePath, "utf8"));
fs.writeFileSync(
  path.join(ROOT, "timeline.html"),
  renderTimelinePage(milestones),
  "utf8",
);
console.log(`[build-site] timeline.html (${milestones.length} milestones)`);

// --- archive.html = list of all reports ---
const rows = dates
  .map((d) => {
    const size = (fs.statSync(path.join(ROOT, d, `${d}.html`)).size / 1024).toFixed(0);
    return `      <li><a href="./${d}/${d}.html">${d}</a> <span class="size">${size} KB</span></li>`;
  })
  .join("\n");

const archiveHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>daily-brief — archive</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    max-width: 720px;
    margin: 3rem auto;
    padding: 0 1.5rem;
    line-height: 1.5;
  }
  h1 { margin-bottom: 0.2rem; font-size: 1.5rem; }
  .meta { color: #888; font-size: 0.9rem; margin-bottom: 1.5rem; }
  ul { list-style: none; padding: 0; }
  li {
    padding: 0.5rem 0;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  @media (prefers-color-scheme: dark) {
    li { border-bottom-color: #2a2a2a; }
  }
  li a { text-decoration: none; }
  li a:hover { text-decoration: underline; }
  .size { color: #999; font-size: 0.85rem; }
  .top {
    margin-bottom: 2rem;
    padding: 0.75rem 1rem;
    background: #f6f6f6;
    border-radius: 6px;
  }
  @media (prefers-color-scheme: dark) {
    .top { background: #1e1e1e; }
  }
</style>
</head>
<body>
  <h1>daily-brief — archive</h1>
  <p class="meta">${dates.length} report${dates.length === 1 ? "" : "s"} · newest first · generated ${new Date().toISOString().slice(0, 10)}</p>
  <div class="top">
    <a href="./index.html">→ Latest report (${latest})</a>
    <br><a href="./timeline.html">→ 智能化进程（建设中）</a>
  </div>
  <ul>
${rows}
  </ul>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "archive.html"), archiveHtml, "utf8");
console.log(`[build-site] archive.html (${dates.length} dates)`);

// .nojekyll prevents GitHub Pages from running Jekyll, which would otherwise
// strip directories whose names start with "_". We don't have any today but
// it's cheap insurance and standard practice for static-site GH Pages.
fs.writeFileSync(path.join(ROOT, ".nojekyll"), "", "utf8");
console.log(`[build-site] .nojekyll`);
