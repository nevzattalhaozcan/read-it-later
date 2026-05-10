# Debugging Guide

> Use this when something is broken and you're not sure where to look.

---

## API Debugging

### Check if the server is running
```bash
curl http://localhost:3001/
# Expected: "Read-it-later API is running"
```

### Test an authenticated route
```bash
TOKEN="your-jwt-token-here"
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/articles
```

### Test registration (and measure speed)
```bash
time curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"password123"}' \
  http://localhost:3001/api/v1/auth/register
```

### View server logs
The API uses `tsx watch` in dev — logs appear in the terminal where `npm run dev` is running.

Key log lines to look for:
```
Successfully connected to MongoDB Atlas   ← DB connected
Email transporter initialized (Ethereal)  ← Mailer ready
Email sent (Ethereal). Preview: https://ethereal.email/message/...  ← Preview link
Startup DB connection failed: ...         ← DB issue
```

---

## WebSocket Debugging

### Check if WebSocket is connecting
In the browser console, look for:
```
Connected to sync server
```
If not present, check:
1. Is the API running on port 3001?
2. Is `WS_URL` correct? (`ws://localhost:3001/ws`)
3. Are there CORS or firewall issues?

### Manually trigger a broadcast test
```bash
# Add an article — should trigger REFETCH_ARTICLES
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' \
  http://localhost:3001/api/v1/articles
```

---

## MongoDB Debugging

### Check connection
Look for `Successfully connected to MongoDB Atlas` in API logs. If absent:
1. Check `MONGODB_URI` in `.env`
2. Check Atlas IP allowlist (add `0.0.0.0/0` for dev)
3. Check username/password in the connection string

### Enable Mongoose query logging
Temporarily add to `apps/api/src/lib/db.ts`:
```typescript
mongoose.set('debug', true);
```

### Common Mongoose errors
| Error | Cause | Fix |
|---|---|---|
| `ValidationError: Path X is required` | Missing required field | Provide the field or set a default |
| `MongoServerError: E11000 duplicate key` | Unique constraint violation (code 11000) | Check for existing document before inserting |
| Field saved as `undefined` / missing | Strict mode stripped it | Add field to schema first |

---

## Email Debugging

### Ethereal test account
When no SMTP env vars are set, emails go to Ethereal. Look for the preview URL in logs:
```
Email sent (Ethereal). Preview: https://ethereal.email/message/...
```
Open that URL to see the email.

### Check if mailer initialized
```
Initializing Ethereal test account for emails...   ← waiting
Email transporter initialized (Ethereal)            ← done
```

If initialization takes too long (> 10s), Ethereal is experiencing issues — set real SMTP credentials.

---

## Web App Debugging

### State inspection
Open React DevTools and look at the `App` component's state. Key things to check:
- `token` — is it set?
- `user` — is it populated?
- `selectedArticle` — which view branch are we in?
- `authError` vs `forgotError` — are they on the right variable?

### Auth loop / infinite redirect
If the app is stuck in a login loop:
1. Open browser devtools → Application → LocalStorage
2. Check if `token` is set
3. Try clearing it and logging in again

### Highlights not appearing
1. Is `articleContentRef.current` set when `applyHighlightsToDOM` is called?
2. Is the `useEffect` that calls `applyHighlightsToDOM` running after `dangerouslySetInnerHTML` sets the content?
3. Is `highlightKey` being incremented to force a re-render?
4. Open console — look for `Could not apply highlight for id: ...` warnings

### i18n key shows `undefined`
- Key exists in `tr` but not `en` (or vice versa)
- Fix: add the missing key to both locales in `i18n.ts`

---

## Deployment / Production Debugging

### 502 Bad Gateway
Most likely causes:
1. **Slow external service in the request path** (email sending blocking, DB cold start)
2. **Timeout on Vercel serverless** — check function timeout settings
3. **Unhandled promise rejection** — check API logs in Vercel dashboard

### CORS errors
Check `CLIENT_ORIGIN` env var in `.env` matches the deployed web URL exactly (no trailing slash).

### Environment variables missing
Check Vercel project settings → Environment Variables. All keys from `.env.example` must be set.
