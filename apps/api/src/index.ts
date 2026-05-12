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
import { sendEmail, getTransporter } from './utils/mailer.js';
import { renderOtpEmail } from './utils/emailTemplates.js';
import admin from 'firebase-admin';
import { logger } from './lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Initialize Firebase Admin
try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
    : undefined;

  if (serviceAccount || process.env.VITE_FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: serviceAccount ? admin.credential.cert(serviceAccount) : admin.credential.applicationDefault(),
      projectId: process.env.VITE_FIREBASE_PROJECT_ID
    });
    logger.info('Firebase Admin initialized');
  }
} catch (error) {
  logger.error({ error }, 'Firebase Admin init error');
}

type Variables = {
  userId: string;
  requestId: string;
};

const app = new Hono<{ Variables: Variables }>();

// Simple in-memory rate limiting / throttling (note: single-process only)
const RATE_LIMITS = {
  OTP_EMAIL_INTERVAL_MS: Number(process.env.OTP_EMAIL_INTERVAL_MS) || 60 * 1000, // 1 per minute per email
  OTP_EMAIL_PER_HOUR: Number(process.env.OTP_EMAIL_PER_HOUR) || 5,
  OTP_IP_PER_HOUR: Number(process.env.OTP_IP_PER_HOUR) || 20,
  VERIFY_ATTEMPTS_PER_HOUR: Number(process.env.VERIFY_ATTEMPTS_PER_HOUR) || 10,
  WINDOW_MS: 60 * 60 * 1000,
};

const lastOtpSentByEmail = new Map<string, number>();
const otpCountByEmailWindow = new Map<string, { count: number; windowStart: number }>();
const otpCountByIpWindow = new Map<string, { count: number; windowStart: number }>();
const verifyAttemptsByEmail = new Map<string, { count: number; windowStart: number }>();

// Auth cache: avoids DB lookup on every authenticated request (5-min TTL)
const AUTH_CACHE = new Map<string, { userId: string; emailVerified: boolean; cachedAt: number }>();
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTH_CACHE_MAX_SIZE = 500;

const emailRegex = /^[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}$/;

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function getClientIp(c: any) {
  const xf = c.req.header('x-forwarded-for') || c.req.header('X-Real-IP') || c.req.header('cf-connecting-ip');
  if (xf) return String(xf).split(',')[0].trim();
  try { return c.req.raw?.socket?.remoteAddress || 'unknown'; } catch { return 'unknown'; }
}

function incrementWindow(map: Map<string, { count: number; windowStart: number }>, key: string, windowMs: number) {
  const now = Date.now();
  const rec = map.get(key);
  if (!rec || rec.windowStart + windowMs < now) {
    map.set(key, { count: 1, windowStart: now });
    return 1;
  }
  rec.count += 1;
  map.set(key, rec);
  return rec.count;
}


// Middlewares
app.use('*', cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-API-KEY', 'Authorization'],
}));

// Request ID middleware
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
});

// Logging middleware
app.use('*', async (c, next) => {
  const { method, url } = c.req;
  const start = Date.now();
  
  await next();
  
  const ms = Date.now() - start;
  const status = c.res.status;
  const requestId = c.get('requestId');

  logger.info({
    type: 'request',
    method,
    url,
    status,
    duration: `${ms}ms`,
    requestId,
  });
});

// DB connection middleware — ensures connection once, not per-route
app.use('/api/*', async (c, next) => {
  await connectDB();
  await next();
});

// JWT Auth Middleware (with in-memory cache to skip DB on repeat requests)
const authMiddleware = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.split(' ')[1];
  
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    // 1. Try Firebase verification first
    const decodedToken = await admin.auth().verifyIdToken(token);
    const { uid, email, name } = decodedToken;

    // Check auth cache first — avoids DB lookup on every request
    const cached = AUTH_CACHE.get(uid);
    const now = Date.now();
    if (cached && (now - cached.cachedAt < AUTH_CACHE_TTL_MS)) {
      // If email_verified hasn't changed (or was already true), skip DB entirely
      if (!decodedToken.email_verified || cached.emailVerified) {
        c.set('userId', cached.userId);
        return next();
      }
    }

    // Cache miss or email_verified changed — sync with MongoDB
    let user = await User.findOne({ firebaseUid: uid });
    if (!user) {
      // migration case: try by email
      user = await User.findOne({ email });
      if (user) {
        user.firebaseUid = uid;
        if (decodedToken.email_verified) user.emailVerified = true;
        await user.save();
      } else {
        // new user
        user = await User.create({
          firebaseUid: uid,
          email,
          name: name || email?.split('@')[0],
          emailVerified: decodedToken.email_verified || false
        });
      }
    } else if (decodedToken.email_verified && !user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }

    const userId = user._id.toString();
    c.set('userId', userId);

    // Update auth cache (evict oldest if full)
    if (AUTH_CACHE.size >= AUTH_CACHE_MAX_SIZE) {
      const oldestKey = AUTH_CACHE.keys().next().value;
      if (oldestKey) AUTH_CACHE.delete(oldestKey);
    }
    AUTH_CACHE.set(uid, { userId, emailVerified: !!user.emailVerified, cachedAt: Date.now() });

    await next();
  } catch (error) {
    // 2. Fallback to legacy JWT for compatibility
    try {
      const secret = process.env.JWT_SECRET || 'dev-jwt-secret';
      const decoded = jwt.verify(token, secret) as any;
      c.set('userId', decoded.userId);
      await next();
    } catch (err) {
      return c.json({ error: 'Invalid token' }, 401);
    }
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
app.get('/api/v1/ping', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Auth Routes
app.post('/api/v1/auth/register', async (c) => {
  const { email, password, name } = await c.req.json();
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  
  try {
    if (!normalizedName) return c.json({ error: 'Name is required' }, 400);
    if (!emailRegex.test(normalizedEmail)) return c.json({ error: 'Invalid email' }, 400);
    if (typeof password !== 'string' || password.trim().length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      if (existingUser.emailVerified) {
        return c.json({ error: 'Email already exists' }, 400);
      }

      try {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const otp = new EmailOTP({ email: normalizedEmail, code, purpose: 'verify', expiresAt });
        await otp.save();
        const subject = 'Your verification code';
        const text = `Your one-time code is: ${code}. It expires in 10 minutes.`;
        const html = renderOtpEmail(code, 'verify', process.env.APP_NAME || 'sonra-okurum');
        // Background the email sending
        sendEmail({ to: normalizedEmail, subject, text, html }).catch(err => logger.error({ err, email: normalizedEmail }, 'Background email failed'));
      } catch (_) {}

      const secret = process.env.JWT_SECRET || 'dev-jwt-secret';
      const token = jwt.sign({ userId: existingUser._id }, secret, { expiresIn: '30d' });

      return c.json({
        token,
        user: { id: existingUser._id, email: existingUser.email, name: existingUser.name },
        requiresVerification: true,
        message: 'Account exists but is not verified. We sent a new verification code.'
      });
    }

    const user = new User({ email: normalizedEmail, password: password.trim(), name: normalizedName });
    await user.save();
    // Create and send verification OTP automatically after registration
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const otp = new EmailOTP({ email: normalizedEmail, code, purpose: 'verify', expiresAt });
      await otp.save();
      const subject = 'Your verification code';
      const text = `Your one-time code is: ${code}. It expires in 10 minutes.`;
      const html = renderOtpEmail(code, 'verify', process.env.APP_NAME || 'sonra-okurum');
      // send email but don't block registration on failure
      // Background the email sending
      sendEmail({ to: normalizedEmail, subject, text, html }).catch(err => logger.error({ err, email: normalizedEmail }, 'Background email failed'));
    } catch (_) {}

    const secret = process.env.JWT_SECRET || 'dev-jwt-secret';
    const token = jwt.sign({ userId: user._id }, secret, { expiresIn: '30d' });

    return c.json({ token, user: { id: user._id, email: user.email, name: user.name, emailVerified: false }, requiresVerification: true }, 201);
  } catch (error) {
    return c.json({ error: 'Registration failed' }, 500);
  }
});

app.post('/api/v1/auth/login', async (c) => {
  const { email, password } = await c.req.json();
  const normalizedEmail = normalizeEmail(email);

  try {
    if (!emailRegex.test(normalizedEmail)) return c.json({ error: 'Invalid credentials' }, 401);
    const user = await User.findOne({ email: normalizedEmail })
      .select('email name password emailVerified')
      .lean() as any;
    if (!user) return c.json({ error: 'Invalid credentials' }, 401);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return c.json({ error: 'Invalid credentials' }, 401);

    const secret = process.env.JWT_SECRET || 'dev-jwt-secret';
    const token = jwt.sign({ userId: user._id }, secret, { expiresIn: '30d' });

    if (!user.emailVerified) {
      return c.json({
        token,
        user: { id: user._id, email: user.email, name: user.name, emailVerified: false },
        requiresVerification: true,
        message: 'Email not verified. Please verify your email to continue.'
      });
    }

    return c.json({ token, user: { id: user._id, email, name: user.name, emailVerified: true } });
  } catch (error) {
    return c.json({ error: 'Login failed' }, 500);
  }
});

// OTP endpoints (send and verify)
app.post('/api/v1/auth/send-otp', async (c) => {
  const { email, purpose } = await c.req.json();
  if (!email || !purpose) return c.json({ error: 'Email and purpose are required' }, 400);
  // Rate-limit checks
  try {
    const now = Date.now();
    const emailKey = String(email).trim().toLowerCase();
    const ip = getClientIp(c) || 'unknown';

    const last = lastOtpSentByEmail.get(emailKey) || 0;
    if (now - last < RATE_LIMITS.OTP_EMAIL_INTERVAL_MS) {
      return c.json({ error: 'Too many requests for this email. Try again later.' }, 429);
    }

    const emailCount = incrementWindow(otpCountByEmailWindow, emailKey, RATE_LIMITS.WINDOW_MS);
    if (emailCount > RATE_LIMITS.OTP_EMAIL_PER_HOUR) {
      return c.json({ error: 'Hourly limit reached for this email.' }, 429);
    }

    const ipCount = incrementWindow(otpCountByIpWindow, ip, RATE_LIMITS.WINDOW_MS);
    if (ipCount > RATE_LIMITS.OTP_IP_PER_HOUR) {
      return c.json({ error: 'Hourly limit reached for this IP.' }, 429);
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const otp = new EmailOTP({ email: email.trim().toLowerCase(), code, purpose, expiresAt });
    await otp.save();

    lastOtpSentByEmail.set(String(email).trim().toLowerCase(), now);

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
  const { email, otp, purpose } = await c.req.json();
  if (!email || !otp || !purpose) return c.json({ error: 'Missing parameters' }, 400);

  try {
    // Throttle verification attempts per email
    const emailKey = String(email).trim().toLowerCase();
    const attempts = incrementWindow(verifyAttemptsByEmail, emailKey, RATE_LIMITS.WINDOW_MS);
    if (attempts > RATE_LIMITS.VERIFY_ATTEMPTS_PER_HOUR) {
      return c.json({ error: 'Too many verification attempts. Try again later.' }, 429);
    }

    const record = await EmailOTP.findOne({ email: emailKey, code: otp, purpose, used: false, expiresAt: { $gt: new Date() } });
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
  const userId = c.get('userId');
  const user = await User.findById(userId).select('-password').lean();
  return c.json(user);
});

api.patch('/auth/me', async (c) => {
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
  const userId = c.get('userId');
  await Article.deleteMany({ owner: userId });
  await UserPreferences.deleteOne({ userId });
  broadcast({ type: 'REFETCH_ARTICLES' });
  broadcast({ type: 'REFETCH_PREFERENCES' });
  return c.json({ success: true });
});

api.delete('/auth/me', async (c) => {
  const userId = c.get('userId');
  await Article.deleteMany({ owner: userId });
  await UserPreferences.deleteOne({ userId });
  await User.findByIdAndDelete(userId);
  broadcast({ type: 'REFETCH_ARTICLES' });
  broadcast({ type: 'REFETCH_PREFERENCES' });
  return c.json({ success: true });
});

api.get('/articles', async (c) => {
  const userId = c.get('userId');
  const articles = await Article.find({ owner: userId })
    .select('-content -textContent')
    .sort({ createdAt: -1 })
    .lean();
  return c.json(articles);
});

// Get single article with full content (for reader view)
api.get('/articles/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const article = await Article.findOne({ _id: id, owner: userId }).lean();
  if (!article) return c.json({ error: 'Article not found' }, 404);
  return c.json(article);
});

api.post('/articles', async (c) => {
  const { url, html } = await c.req.json();
  
  if (!url) return c.json({ error: 'URL is required' }, 400);

  const userId = c.get('userId');
  try {
    
    // 1. Create a placeholder article immediately
    const tempTitle = new URL(url).hostname;
    const article = new Article({
      owner: userId,
      url,
      title: tempTitle,
      isPending: true
    });
    await article.save();
    
    // 2. Perform scraping in the background
    (async () => {
      try {
        const scraped = await scrapeUrl(url, html);
        await Article.findByIdAndUpdate(article._id, { ...scraped, isPending: false });
        broadcast({ type: 'REFETCH_ARTICLES' });
      } catch (err) {
        logger.error({ err, url }, '[Background Scrape] Failed');
        await Article.findByIdAndUpdate(article._id, { isPending: false });
        broadcast({ type: 'REFETCH_ARTICLES' });
      }
    })();
    
    return c.json(article.toObject(), 201);
  } catch (error: any) {
    if (error.code === 11000) {
      logger.warn({ 
        error: error.message, 
        code: error.code, 
        keyPattern: error.keyPattern, 
        keyValue: error.keyValue,
        userId,
        url 
      }, 'Duplicate article detected');
      return c.json({ error: 'Article already exists' }, 409);
    }
    logger.error({ error, userId, url }, 'Failed to create article');
    return c.json({ error: 'Failed to create article' }, 500);
  }
});

// Check if URL exists
api.get('/check', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'URL is required' }, 400);
  
  const userId = c.get('userId');
  const exists = await Article.exists({ owner: userId, url });
  return c.json({ exists: !!exists });
});

// Update article (tags, folder, etc.)
api.patch('/articles/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  const userId = c.get('userId');
  const article = await Article.findOneAndUpdate({ _id: id, owner: userId }, body, { new: true });
  if (!article) return c.json({ error: 'Article not found' }, 404);
  
  broadcast({ type: 'REFETCH_ARTICLES' });
  return c.json(article);
});

api.delete('/articles/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  await Article.findOneAndDelete({ _id: id, owner: userId });
  
  // Broadcast change
  broadcast({ type: 'REFETCH_ARTICLES' });
  
  return c.json({ success: true });
});

// User preferences
api.get('/preferences', async (c) => {
  const userId = c.get('userId');
  const prefs = await UserPreferences.findOne({ userId });
  return c.json(prefs ?? { lang: 'tr', theme: 'light', fontSizeIdx: 2, widthIdx: 1 });
});

api.patch('/preferences', async (c) => {
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

// Pre-initialize DB and Mailer at startup
connectDB().then(async () => {
  try {
    const indexes = await Article.listIndexes();
    logger.info({ indexes }, 'Current Article indexes');
  } catch (err) {
    logger.error({ err }, 'Failed to list Article indexes');
  }
}).catch(err => logger.error({ err }, 'Startup DB connection failed'));
getTransporter().catch(err => logger.error({ err }, 'Startup Mailer initialization failed'));

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
  logger.info('Client connected to WebSocket via /ws');
  ws.on('close', () => logger.info('Client disconnected'));
});

logger.info(`Server is running on port ${port}`);
