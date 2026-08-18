const DAY_MS = 86_400_000;

function titleKey(title) {
  return String(title ?? "")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function dayOffset(day, offset) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function allBriefs(reports) {
  return reports.flatMap(({ date, report }) =>
    ["tech_briefs", "finance_briefs", "politics_briefs"].flatMap((key) =>
      (Array.isArray(report[key]) ? report[key] : []).map((brief) => ({
        ...brief,
        date,
      })),
    ),
  );
}

function uniqueBriefs(items, limit) {
  const seenTitles = new Set();
  const seenUrls = new Set();
  return items.filter((item) => {
    const key = titleKey(item.title);
    if (!key || seenTitles.has(key) || seenUrls.has(item.url)) return false;
    seenTitles.add(key);
    seenUrls.add(item.url);
    return true;
  }).slice(0, limit);
}

/**
 * Build a cross-device catch-up view without read-state or a database.
 * Reports are newest-first and use their on-disk date as the source of time.
 */
export function buildRollingReview(reports, latestDate) {
  const usable = reports
    .filter(({ date, report }) => date && report)
    .sort((a, b) => b.date.localeCompare(a.date));
  const all = allBriefs(usable);
  const weekStart = dayOffset(latestDate, -6);
  const weekly = uniqueBriefs(
    all
      .filter((brief) => brief.date >= weekStart && brief.date <= latestDate)
      .sort((a, b) =>
        (Number(b.importance) - Number(a.importance)) ||
        b.date.localeCompare(a.date),
      ),
    10,
  );

  const monthStart = dayOffset(latestDate, -29);
  const monthlyReports = usable.filter(
    ({ date }) => date >= monthStart && date <= latestDate,
  );
  const topicDays = new Map();
  for (const { date, report } of monthlyReports) {
    for (const keyword of Array.isArray(report.keywords) ? report.keywords : []) {
      const topic = String(keyword).trim();
      if (!topic) continue;
      const days = topicDays.get(topic) ?? new Set();
      days.add(date);
      topicDays.set(topic, days);
    }
  }

  const trends = [...topicDays.entries()]
    .map(([topic, days]) => {
      const related = all
        .filter((brief) =>
          brief.date >= monthStart &&
          `${brief.title} ${brief.summary}`.toLocaleLowerCase().includes(topic.toLocaleLowerCase()),
        )
        .sort((a, b) => b.date.localeCompare(a.date) || Number(b.importance) - Number(a.importance))[0];
      return {
        topic,
        days: days.size,
        latest: related?.title ?? "持续跟踪中",
      };
    })
    .filter((trend) => trend.days >= 2)
    .sort((a, b) => b.days - a.days || a.topic.localeCompare(b.topic))
    .slice(0, 5);

  return { weekly, trends };
}
