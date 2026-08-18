import assert from "node:assert/strict";
import { buildRollingReview } from "./rolling-review.mjs";

const brief = (title, importance, summary = "") => ({
  title,
  url: `https://example.com/${encodeURIComponent(title)}`,
  source: "test",
  summary,
  importance,
});
const report = (keywords, briefs) => ({
  keywords,
  tech_briefs: briefs,
  finance_briefs: [],
  politics_briefs: [],
});

const result = buildRollingReview([
  { date: "2026-08-18", report: report(["触觉", "人形机器人"], [brief("触觉量产", 9, "触觉订单")]) },
  { date: "2026-08-16", report: report(["触觉"], [brief("触觉量产", 8), brief("机器人部署", 8, "人形机器人")]) },
  { date: "2026-07-10", report: report(["过期主题"], [brief("旧消息", 10)]) },
], "2026-08-18");

assert.equal(result.weekly.length, 2);
assert.equal(result.weekly[0].title, "触觉量产");
assert.equal(result.trends[0].topic, "触觉");
assert.equal(result.trends.some((trend) => trend.topic === "人形机器人"), true);
assert.equal(result.trends.some((trend) => trend.topic === "过期主题"), false);
console.log("rolling review checks passed");
