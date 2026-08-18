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
const latestHtml = fs
  .readFileSync(latestPath, "utf8")
  .replace(/href="\.\.\/archive\.html"/g, 'href="./archive.html"')
  .replace(
    '<button class="tab" data-tab="tech"',
    `${rollingReviewHtml ? `<button class="tab" data-tab="review">近期回顾</button>\n    ` : ""}<button class="tab" type="button" onclick="window.location.href='./timeline.html'">智能化进程</button>\n    <button class="tab" data-tab="tech"`,
  )
  .replace(
    '<section class="panel active" data-panel="digest">',
    `${rollingReviewHtml ? `<section class="panel" data-panel="review">${rollingReviewHtml}</section>\n  ` : ""}<section class="panel active" data-panel="digest">`,
  );
fs.writeFileSync(path.join(ROOT, "index.html"), latestHtml, "utf8");
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
