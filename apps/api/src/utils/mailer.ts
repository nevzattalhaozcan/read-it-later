import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let transporter: nodemailer.Transporter | null = null;

export async function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.EMAIL_SMTP_HOST;
  const port = process.env.EMAIL_SMTP_PORT ? Number(process.env.EMAIL_SMTP_PORT) : undefined;
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({ host, port, auth: { user, pass }, secure: false });
    console.log('Email transporter initialized (SMTP)');
    return transporter;
  }

  // Fallback to ethereal test account (free, for development)
  try {
    console.log('Initializing Ethereal test account for emails...');
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({ host: 'smtp.ethereal.email', port: 587, auth: { user: testAccount.user, pass: testAccount.pass } });
    console.log('Email transporter initialized (Ethereal)');
    return transporter;
  } catch (error) {
    console.error('Failed to initialize email transporter:', error);
    throw error;
  }
}

export async function sendEmail(opts: { to: string; subject: string; text?: string; html?: string; from?: string; }) {
  const t = await getTransporter();
  const from = opts.from || process.env.EMAIL_FROM || 'no-reply@example.com';
  const info = await t.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html });
  // If using ethereal, return the preview URL to help debugging
  // @ts-ignore
  const preview = nodemailer.getTestMessageUrl(info) || null;
  if (preview) console.log('Email sent (Ethereal). Preview:', preview);
  return { info, preview };
}
