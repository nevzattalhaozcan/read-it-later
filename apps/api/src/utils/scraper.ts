import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';
import { logger } from '../lib/logger.js';

export interface ScrapedData {
  title: string;
  description: string;
  content: string;
  textContent: string;
  byline: string;
  siteName: string;
  favicon: string;
  coverImage: string;
  readingTimeMinutes: number;
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9,tr-TR;q=0.8,tr;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'max-age=0',
  'Connection': 'keep-alive',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

function isBlockedResponse(html: string, status: number): boolean {
  return (
    html.includes('Just a moment...') ||
    html.includes('Enable JavaScript and cookies to continue') ||
    (status === 403 && html.includes('<title>Access denied</title>')) ||
    html.includes('cf-browser-verification') ||
    html.includes('You need to enable JavaScript') ||
    html.includes('JavaScript is required') ||
    html.includes('Please enable JS')
  );
}

function isSPAShell(html: string): boolean {
  return (
    (html.includes('id="root"') || html.includes('id="app"')) &&
    !html.includes('<article') &&
    !html.includes('<main') &&
    html.length < 5000
  );
}

function parseWithReadability(html: string, url: string) {
  const dom = new JSDOM(html, { url });
  return new Readability(dom.window.document).parse();
}

async function fetchJina(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal,
      headers: { 'X-Return-Format': 'html' }
    });
    return res.ok ? res.text() : null;
  } catch {
    return null;
  }
}

export async function scrapeUrl(url: string, providedHtml?: string): Promise<ScrapedData> {
  let html = '';
  let article: ReturnType<typeof parseWithReadability> = null;

  if (providedHtml) {
    html = providedHtml;
  } else {
    // Start Jina immediately in parallel — abort it if direct fetch gives good content,
    // otherwise it's already in-flight and we just await the result with no extra delay.
    const jinaAbort = new AbortController();
    const jinaTimer = setTimeout(() => jinaAbort.abort(), 15000);
    const jinaPromise = fetchJina(url, jinaAbort.signal);

    const directAbort = new AbortController();
    const directTimer = setTimeout(() => directAbort.abort(), 8000);

    let directHtml: string | null = null;
    let directOk = false;

    try {
      const res = await fetch(url, { signal: directAbort.signal, headers: BROWSER_HEADERS });
      directHtml = await res.text();
      directOk = !isBlockedResponse(directHtml, res.status) && !isSPAShell(directHtml);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        logger.error({ url }, '[Scraper] Direct fetch timed out');
      } else {
        logger.error({ err, url }, '[Scraper] Direct fetch failed');
      }
    } finally {
      clearTimeout(directTimer);
    }

    if (directOk && directHtml) {
      article = parseWithReadability(directHtml, url);

      if (article?.textContent && article.textContent.length >= 200) {
        // Direct fetch gave good content — abort Jina, we're done
        jinaAbort.abort();
        clearTimeout(jinaTimer);
        html = directHtml;
      } else {
        // Direct page loaded but content is thin — Jina was already in-flight, just await it
        logger.info({ url, length: article?.textContent?.length }, '[Scraper] Content too short, awaiting Jina (already in-flight)...');
        const jinaHtml = await jinaPromise;
        clearTimeout(jinaTimer);
        if (jinaHtml && jinaHtml.length > directHtml.length) {
          html = jinaHtml;
          article = parseWithReadability(html, url);
        } else {
          html = directHtml;
        }
      }
    } else {
      // Blocked, failed, or timed out — Jina was already running, just await it
      logger.info({ url }, '[Scraper] Direct fetch blocked/failed, awaiting Jina (already in-flight)...');
      const jinaHtml = await jinaPromise;
      clearTimeout(jinaTimer);
      html = jinaHtml || directHtml || `<html><title>${url}</title><body>Failed to load content.</body></html>`;
    }
  }

  if (!article) {
    article = parseWithReadability(html, url);
  }

  const $ = cheerio.load(html);
  const title = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
  const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
  const coverImage = $('meta[property="og:image"]').attr('content') || '';

  let favicon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || '/favicon.ico';
  if (favicon && !favicon.startsWith('http')) {
    const urlObj = new URL(url);
    favicon = `${urlObj.origin}${favicon.startsWith('/') ? '' : '/'}${favicon}`;
  }

  const finalTitle = article?.title || title || 'Untitled';
  const finalContent = article?.content || '';
  const finalTextContent = article?.textContent || '';
  const byline = article?.byline || '';
  const siteName = article?.siteName || '';

  const words = finalTextContent.trim().split(/\s+/).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 225));

  return {
    title: finalTitle,
    description: article?.excerpt || description,
    content: finalContent,
    textContent: finalTextContent,
    byline,
    siteName,
    favicon,
    coverImage,
    readingTimeMinutes
  };
}
