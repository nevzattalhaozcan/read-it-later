import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { connectDB } from './lib/db.js';
import { User } from './models/User.js';
import { Article } from './models/Article.js';
import { UserPreferences } from './models/UserPreferences.js';
import { scrapeUrl } from './utils/scraper.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

type Variables = {
  userId: string;
};

const app = new Hono<{ Variables: Variables }>();

// Middlewares
app.use('*', cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-KEY', 'Authorization'],
}));

// JWT Auth Middleware
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'dev-jwt-secret';
  
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const decoded = jwt.verify(token, secret) as any;
    c.set('userId', decoded.userId);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
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

// Auth Routes
app.post('/api/v1/auth/register', async (c) => {
  await connectDB();
  const { email, password, name } = await c.req.json();
  
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return c.json({ error: 'Email already exists' }, 400);

    const user = new User({ email, password, name });
    await user.save();

    const secret = process.env.JWT_SECRET || 'dev-jwt-secret';
    const token = jwt.sign({ userId: user._id }, secret, { expiresIn: '30d' });

    return c.json({ token, user: { id: user._id, email, name } }, 201);
  } catch (error) {
    return c.json({ error: 'Registration failed' }, 500);
  }
});

app.post('/api/v1/auth/login', async (c) => {
  await connectDB();
  const { email, password } = await c.req.json();

  try {
    const user = await User.findOne({ email });
    if (!user) return c.json({ error: 'Invalid credentials' }, 401);

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return c.json({ error: 'Invalid credentials' }, 401);

    const secret = process.env.JWT_SECRET || 'dev-jwt-secret';
    const token = jwt.sign({ userId: user._id }, secret, { expiresIn: '30d' });

    return c.json({ token, user: { id: user._id, email, name: user.name } });
  } catch (error) {
    return c.json({ error: 'Login failed' }, 500);
  }
});

const api = new Hono<{ Variables: Variables }>();
api.use('*', authMiddleware);

api.get('/auth/me', async (c) => {
  await connectDB();
  const userId = c.get('userId');
  const user = await User.findById(userId).select('-password');
  return c.json(user);
});

api.get('/articles', async (c) => {
  await connectDB();
  const userId = c.get('userId');
  const articles = await Article.find({ owner: userId }).sort({ createdAt: -1 });
  return c.json(articles);
});

api.post('/articles', async (c) => {
  await connectDB();
  const { url, html } = await c.req.json();
  
  if (!url) return c.json({ error: 'URL is required' }, 400);

  try {
    const userId = c.get('userId');
    const scraped = await scrapeUrl(url, html);
    const article = new Article({
      owner: userId,
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
  
  const userId = c.get('userId');
  const article = await Article.findOne({ owner: userId, url });
  return c.json({ exists: !!article });
});

// Update article (tags, folder, etc.)
api.patch('/articles/:id', async (c) => {
  await connectDB();
  const id = c.req.param('id');
  const body = await c.req.json();
  
  const userId = c.get('userId');
  const article = await Article.findOneAndUpdate({ _id: id, owner: userId }, body, { new: true });
  if (!article) return c.json({ error: 'Article not found' }, 404);
  
  broadcast({ type: 'REFETCH_ARTICLES' });
  return c.json(article);
});

api.delete('/articles/:id', async (c) => {
  await connectDB();
  const userId = c.get('userId');
  const id = c.req.param('id');
  await Article.findOneAndDelete({ _id: id, owner: userId });
  
  // Broadcast change
  broadcast({ type: 'REFETCH_ARTICLES' });
  
  return c.json({ success: true });
});

// User preferences
api.get('/preferences', async (c) => {
  await connectDB();
  const userId = c.get('userId');
  const prefs = await UserPreferences.findOne({ userId });
  return c.json(prefs ?? { lang: 'tr', theme: 'light', fontSizeIdx: 2, widthIdx: 1 });
});

api.patch('/preferences', async (c) => {
  await connectDB();
  const userId = c.get('userId');
  const body = await c.req.json();
  const prefs = await UserPreferences.findOneAndUpdate(
    { userId },
    { $set: body },
    { new: true, upsert: true }
  );
  broadcast({ type: 'REFETCH_PREFERENCES' });
  return c.json(prefs);
});

api.post('/translate', async (c) => {
  await connectDB();
  const { text, target, source } = await c.req.json();

  if (!text || typeof text !== 'string' || !text.trim()) {
    return c.json({ error: 'Text is required' }, 400);
  }

  const normalizedTarget = typeof target === 'string' && ['tr', 'en'].includes(target) ? target : 'tr';
  const libreTranslateUrl = (process.env.LIBRETRANSLATE_URL || 'https://de.libretranslate.com/translate').replace(/\/$/, '');

  try {
    const response = await fetch(libreTranslateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        q: text.trim(),
        source: typeof source === 'string' && source ? source : 'auto',
        target: normalizedTarget,
        format: 'text',
      })
    });

    const rawBody = await response.text();
    let data: any = null;
    try {
      data = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message = data?.error || data?.message || `Translation failed (${response.status})`;
      return c.json({ error: message }, 502);
    }

    const translatedText = data?.translatedText || data?.data?.translations?.[0]?.translatedText || '';
    const decodedText = typeof translatedText === 'string'
      ? translatedText
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
      : '';

    return c.json({ translatedText: decodedText, target: normalizedTarget });
  } catch (error) {
    return c.json({ error: 'Translation request failed' }, 502);
  }
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
