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
import { EmailOTP } from './models/EmailOTP.js';
import { sendEmail } from './utils/mailer.js';
import { renderOtpEmail } from './utils/emailTemplates.js';

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
    // Create and send verification OTP automatically after registration
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const otp = new EmailOTP({ email: email.trim().toLowerCase(), code, purpose: 'verify', expiresAt });
      await otp.save();
      const subject = 'Your verification code';
      const text = `Your one-time code is: ${code}. It expires in 10 minutes.`;
      const html = renderOtpEmail(code, 'verify', process.env.APP_NAME || 'sonra-okurum');
      // send email but don't block registration on failure
      try { await sendEmail({ to: email, subject, text, html }); } catch (_) {}
    } catch (_) {}

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

// OTP endpoints (send and verify)
app.post('/api/v1/auth/send-otp', async (c) => {
  await connectDB();
  const { email, purpose } = await c.req.json();
  if (!email || !purpose) return c.json({ error: 'Email and purpose are required' }, 400);

  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const otp = new EmailOTP({ email: email.trim().toLowerCase(), code, purpose, expiresAt });
    await otp.save();

    const subject = purpose === 'reset' ? 'Your password reset code' : 'Your verification code';
    const text = `Your one-time code is: ${code}. It expires in 10 minutes.`;

    const html = renderOtpEmail(code, purpose as any, process.env.APP_NAME || 'sonra-okurum');
    const { preview } = await sendEmail({ to: email, subject, text, html });
    return c.json({ success: true, preview });
  } catch (error: any) {
    return c.json({ error: 'Failed to send OTP' }, 500);
  }
});

app.post('/api/v1/auth/verify-otp', async (c) => {
  await connectDB();
  const { email, otp, purpose } = await c.req.json();
  if (!email || !otp || !purpose) return c.json({ error: 'Missing parameters' }, 400);

  try {
    const record = await EmailOTP.findOne({ email: email.trim().toLowerCase(), code: otp, purpose, used: false, expiresAt: { $gt: new Date() } });
    if (!record) return c.json({ error: 'Invalid or expired code' }, 400);

    record.used = true;
    await record.save();

    if (purpose === 'verify') {
      // Mark user as verified
      const user = await User.findOne({ email: email.trim().toLowerCase() });
      if (user) {
        user.emailVerified = true;
        await user.save();
      }
    }

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: 'Verification failed' }, 500);
  }
});

app.post('/api/v1/auth/reset-password', async (c) => {
  await connectDB();
  const { email, otp, newPassword } = await c.req.json();
  if (!email || !otp || !newPassword) return c.json({ error: 'Missing parameters' }, 400);

  try {
    const record = await EmailOTP.findOne({ email: email.trim().toLowerCase(), code: otp, purpose: 'reset', used: false, expiresAt: { $gt: new Date() } });
    if (!record) return c.json({ error: 'Invalid or expired code' }, 400);

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) return c.json({ error: 'User not found' }, 404);

    user.password = newPassword.trim();
    await user.save();

    record.used = true;
    await record.save();

    return c.json({ success: true });
  } catch (error: any) {
    return c.json({ error: 'Password reset failed' }, 500);
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

api.patch('/auth/me', async (c) => {
  await connectDB();
  const userId = c.get('userId');
  const { email, currentPassword, newPassword } = await c.req.json();

  const user = await User.findById(userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const wantsEmailChange = typeof email === 'string' && email.trim() && email.trim().toLowerCase() !== user.email;
  const wantsPasswordChange = typeof newPassword === 'string' && newPassword.trim().length >= 6;

  if (!wantsEmailChange && !wantsPasswordChange) {
    return c.json({ error: 'No changes provided' }, 400);
  }

  if (typeof currentPassword !== 'string' || !currentPassword.trim()) {
    return c.json({ error: 'Current password is required' }, 400);
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) return c.json({ error: 'Invalid credentials' }, 401);

  if (wantsEmailChange) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } });
    if (existingUser) return c.json({ error: 'Email already exists' }, 400);
    user.email = normalizedEmail;
  }

  if (wantsPasswordChange) {
    user.password = newPassword.trim();
  }

  await user.save();

  const updatedUser = await User.findById(userId).select('-password');
  return c.json(updatedUser);
});

api.delete('/data', async (c) => {
  await connectDB();
  const userId = c.get('userId');
  await Article.deleteMany({ owner: userId });
  await UserPreferences.deleteOne({ userId });
  broadcast({ type: 'REFETCH_ARTICLES' });
  broadcast({ type: 'REFETCH_PREFERENCES' });
  return c.json({ success: true });
});

api.delete('/auth/me', async (c) => {
  await connectDB();
  const userId = c.get('userId');
  await Article.deleteMany({ owner: userId });
  await UserPreferences.deleteOne({ userId });
  await User.findByIdAndDelete(userId);
  broadcast({ type: 'REFETCH_ARTICLES' });
  broadcast({ type: 'REFETCH_PREFERENCES' });
  return c.json({ success: true });
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
  const sourceText = text.trim();

  try {
    const translateUrl = new URL('https://translate.googleapis.com/translate_a/single');
    translateUrl.searchParams.set('client', 'gtx');
    translateUrl.searchParams.set('sl', 'auto');
    translateUrl.searchParams.set('tl', normalizedTarget);
    translateUrl.searchParams.set('dt', 't');
    translateUrl.searchParams.set('q', sourceText);

    const response = await fetch(translateUrl.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error || data?.message || `Translation failed (${response.status})`;
      return c.json({ error: message }, 502);
    }

    const translatedText = Array.isArray(data?.[0])
      ? data[0].map((segment: any[]) => segment?.[0] || '').join('')
      : '';
    const decodedText = typeof translatedText === 'string'
      ? translatedText
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
      : '';

    if (!decodedText.trim()) {
      return c.json({ error: 'Translation provider returned an empty result.' }, 502);
    }

    const detectedSource = typeof data?.[2] === 'string' ? data[2] : 'auto';
    return c.json({ translatedText: decodedText, target: normalizedTarget, source: detectedSource });
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
