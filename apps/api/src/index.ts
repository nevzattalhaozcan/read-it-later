import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { connectDB } from './lib/db';
import { Article } from './models/Article';
import { UserPreferences } from './models/UserPreferences';
import { scrapeUrl } from './utils/scraper';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = new Hono();

// Middlewares
app.use('*', cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-KEY'],
}));

// Simple Secret Token Auth Middleware
const authMiddleware = async (c: any, next: any) => {
  const apiKey = c.req.header('X-API-KEY');
  const secret = process.env.API_SECRET || 'dev-secret-key';
  
  if (apiKey !== secret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

// WebSocket logic
let wss: WebSocketServer;

const broadcast = (data: any) => {
  if (!wss) return;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// Routes
app.get('/', (c) => c.text('Read-it-later API is running'));

const api = new Hono();
api.use('*', authMiddleware);

api.get('/articles', async (c) => {
  await connectDB();
  const articles = await Article.find().sort({ createdAt: -1 });
  return c.json(articles);
});

api.post('/articles', async (c) => {
  await connectDB();
  const { url, html } = await c.req.json();
  
  if (!url) return c.json({ error: 'URL is required' }, 400);

  try {
    const scraped = await scrapeUrl(url, html);
    const article = new Article({
      url,
      ...scraped
    });
    await article.save();
    
    // Broadcast change
    broadcast({ type: 'REFETCH_ARTICLES' });
    
    return c.json(article, 201);
  } catch (error: any) {
    if (error.code === 11000) {
      return c.json({ error: 'Article already exists' }, 409);
    }
    return c.json({ error: 'Failed to scrape or save article' }, 500);
  }
});

// Check if URL exists
api.get('/check', async (c) => {
  await connectDB();
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'URL is required' }, 400);
  
  const article = await Article.findOne({ url });
  return c.json({ exists: !!article });
});

// Update article (tags, folder, etc.)
api.patch('/articles/:id', async (c) => {
  await connectDB();
  const id = c.req.param('id');
  const body = await c.req.json();
  
  const article = await Article.findByIdAndUpdate(id, body, { new: true });
  if (!article) return c.json({ error: 'Article not found' }, 404);
  
  broadcast({ type: 'REFETCH_ARTICLES' });
  return c.json(article);
});

api.delete('/articles/:id', async (c) => {
  await connectDB();
  const id = c.req.param('id');
  await Article.findByIdAndDelete(id);
  
  // Broadcast change
  broadcast({ type: 'REFETCH_ARTICLES' });
  
  return c.json({ success: true });
});

// User preferences (singleton, userId='default')
api.get('/preferences', async (c) => {
  await connectDB();
  const prefs = await UserPreferences.findOne({ userId: 'default' });
  return c.json(prefs ?? { lang: 'tr', theme: 'light' });
});

api.patch('/preferences', async (c) => {
  await connectDB();
  const body = await c.req.json();
  const prefs = await UserPreferences.findOneAndUpdate(
    { userId: 'default' },
    { $set: body },
    { new: true, upsert: true }
  );
  broadcast({ type: 'REFETCH_PREFERENCES' });
  return c.json(prefs);
});

app.route('/api/v1', api);

const port = Number(process.env.PORT) || 3001;
const server = serve({
  fetch: app.fetch,
  port
});

// Create WebSocket server with a specific path
wss = new WebSocketServer({ noServer: true });

// Manually handle the upgrade event for stability
(server as any).on('upgrade', (request: any, socket: any, head: any) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket via /ws');
  ws.on('close', () => console.log('Client disconnected'));
});

console.log(`Server is running on port ${port}`);
