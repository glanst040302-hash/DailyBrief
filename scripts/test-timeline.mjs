import assert from "node:assert/strict";
import fs from "node:fs";
import { renderTimelinePage, validateMilestones } from "./timeline-page.mjs";

const milestones = JSON.parse(fs.readFileSync("data/intelligence-milestones.json", "utf8"));
validateMilestones(milestones);
const html = renderTimelinePage(milestones);
assert.match(html, /智能化进程/);
assert.match(html, /滚轮缩放/);
assert.match(html, /GelSight/);
assert.match(html, /ResizeObserver/);
console.log("timeline checks passed");
