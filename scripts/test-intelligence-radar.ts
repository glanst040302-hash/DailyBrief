import assert from "node:assert/strict";

import { enforceReportBudget, type BriefItem, type DailyReport } from "../lib/ai/pipeline";
import { matchesKeywords } from "../lib/sources/rss";

assert.equal(matchesKeywords("New tactile sensor", undefined, ["TACTILE"]), true);
assert.equal(matchesKeywords("Routine app update", "No hardware", ["robot"]), false);
assert.equal(matchesKeywords("Any item", undefined, []), true);

const item = (n: number, title = `标题 ${n}`): BriefItem => ({
  title,
  url: `https://example.com/${n}`,
  source: "test",
  summary: "事实｜意义｜关系",
  importance: 8,
});

const report: DailyReport = {
  hero_headline: "test",
  daily_overview: "test",
  tech_briefs: [item(1), item(2), item(3), item(4), item(5)],
  finance_briefs: [item(6), item(7), item(8)],
  politics_briefs: [item(9), item(10), item(11, "标题 1"), item(99)],
  editor_note: "test",
  keywords: [],
};

const allowed = new Set(Array.from({ length: 11 }, (_, i) => `https://example.com/${i + 1}`));
const curated = enforceReportBudget(report, allowed);

assert.equal(curated.tech_briefs.length, 4);
assert.equal(curated.finance_briefs.length, 2);
assert.equal(curated.politics_briefs.length, 2);
assert.equal(
  curated.tech_briefs.length + curated.finance_briefs.length + curated.politics_briefs.length,
  8,
);
assert.equal(curated.politics_briefs.some((entry) => entry.url.endsWith("/99")), false);

console.log("intelligence radar checks passed");
