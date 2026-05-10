export function renderOtpEmail(code: string, purpose: 'verify' | 'reset', appName = 'sonra-okurum') {
  const title = purpose === 'reset' ? 'Password reset code' : 'Verification code';
  const intro = purpose === 'reset'
    ? 'Use the code below to reset your password. The code expires in 10 minutes.'
    : 'Use the code below to verify your email address. The code expires in 10 minutes.';

  const primaryColor = '#2563eb'; // brand blue
  const bg = '#ffffff';
  const textColor = '#0f172a';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <style>
      body { background: ${bg}; color: ${textColor}; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; margin:0; padding:0; }
      .container { max-width:600px; margin:28px auto; padding:24px; border-radius:12px; border:1px solid #eef2ff; }
      .brand { display:flex; align-items:center; gap:12px; }
      .logo { width:44px; height:44px; border-radius:10px; background:${primaryColor}; display:flex; align-items:center; justify-content:center; color:white; font-weight:700; }
      h1 { font-size:18px; margin:18px 0 8px 0; }
      p { margin:0 0 12px 0; line-height:1.5; color: #475569 }
      .code { margin:18px 0; padding:18px; text-align:center; border-radius:8px; background:#f8fafc; font-size:24px; letter-spacing:6px; font-weight:700; color:${primaryColor} }
      .footer { margin-top:20px; font-size:12px; color:#94a3b8 }
      .button { display:inline-block; margin-top:14px; padding:10px 14px; border-radius:8px; background:${primaryColor}; color:white; text-decoration:none }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="brand">
        <div class="logo">S</div>
        <div>
          <div style="font-weight:700">${appName}</div>
          <div style="font-size:12px;color:#64748b">${title}</div>
        </div>
      </div>
      <h1>${title}</h1>
      <p>${intro}</p>
      <div class="code">${code}</div>
      <p>If you did not request this, you can safely ignore this email.</p>
      <div class="footer">This message was sent by ${appName}. If you have questions, reply to this email.</div>
    </div>
  </body>
</html>`;
}
