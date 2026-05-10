import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';

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

export async function scrapeUrl(url: string, providedHtml?: string): Promise<ScrapedData> {
  let html = '';
  
  if (providedHtml) {
    html = providedHtml;
  } else {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    html = await response.text();
  }
  
  // 1. Metadata extraction with Cheerio
  const $ = cheerio.load(html);
  const title = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
  const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
  const coverImage = $('meta[property="og:image"]').attr('content') || '';
  
  // Try to find favicon
  let favicon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || '/favicon.ico';
  if (favicon && !favicon.startsWith('http')) {
    const urlObj = new URL(url);
    favicon = `${urlObj.origin}${favicon.startsWith('/') ? '' : '/'}${favicon}`;
  }

  // 2. Content extraction with Readability
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const finalTitle = article?.title || title || 'Untitled';
  const finalContent = article?.content || '';
  const finalTextContent = article?.textContent || '';
  const byline = article?.byline || '';
  const siteName = article?.siteName || '';
  
  // 3. Estimate reading time (average 225 wpm)
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
