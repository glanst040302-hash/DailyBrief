import Parser from "rss-parser";
import { curlFetch } from "./curl-fetch";
import type { Category, RawArticle } from "./types";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; DailyBriefBot/1.0; +https://github.com/)",
  },
});

const CURL_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function matchesKeywords(
  title: string,
  excerpt: string | undefined,
  keywords: string[] | undefined,
): boolean {
  const normalized = (keywords ?? [])
    .map((keyword) => keyword.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (normalized.length === 0) return true;
  const haystack = `${title}\n${excerpt ?? ""}`.toLocaleLowerCase();
  return normalized.some((keyword) => haystack.includes(keyword));
}

export async function fetchRss(
  sourceId: string,
  url: string,
  category: Category,
  options: { limit?: number; useCurl?: boolean; keywords?: string[] } = {},
): Promise<RawArticle[]> {
  const limit = options.limit ?? 30;

  let feed;
  if (options.useCurl) {
    const xml = await curlFetch(url, CURL_HEADERS);
    feed = await parser.parseString(xml);
  } else {
    feed = await parser.parseURL(url);
  }

  return (feed.items ?? [])
    .map((item) => ({
      sourceId,
      title: (item.title ?? "").trim(),
      url: (item.link ?? "").trim(),
      excerpt: stripHtml(item.contentSnippet ?? item.content ?? "").slice(
        0,
        300,
      ),
      publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
      category,
    }))
    .filter((a) => a.title && a.url)
    .filter((a) => matchesKeywords(a.title, a.excerpt, options.keywords))
    .slice(0, limit);
}
