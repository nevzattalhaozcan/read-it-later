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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
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
        }
      });
      html = await response.text();

      // Cloudflare / Bot Protection Check
      const isCloudflareBlocked = 
        html.includes('Just a moment...') ||
        html.includes('Enable JavaScript and cookies to continue') ||
        (response.status === 403 && html.includes('<title>Access denied</title>')) ||
        html.includes('cf-browser-verification');

      if (isCloudflareBlocked) {
        console.log(`[Scraper] Anti-bot detected for ${url}. Using Jina AI fallback...`);
        const jinaController = new AbortController();
        const jinaTimeout = setTimeout(() => jinaController.abort(), 10000); // 10s timeout
        try {
          const jinaResponse = await fetch(`https://r.jina.ai/${url}`, {
            signal: jinaController.signal,
            headers: { 'X-Return-Format': 'html' }
          });
          if (jinaResponse.ok) {
            html = await jinaResponse.text();
          }
        } catch (err) {
          console.error('[Scraper] Jina AI fallback failed:', err);
        } finally {
          clearTimeout(jinaTimeout);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.error(`[Scraper] Request timed out for ${url}`);
      } else {
        console.error(`[Scraper] Fetch failed for ${url}:`, err);
      }
      html = `<html><title>${url}</title><body>Failed to load content.</body></html>`;
    } finally {
      clearTimeout(timeout);
    }
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
