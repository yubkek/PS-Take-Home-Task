import Groq from 'groq-sdk';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSummarizer } from './ai/summarizer.ts';
import { createApp } from './app.ts';
import { openDb } from './db.ts';

const dataDir = new URL('../data/', import.meta.url);
mkdirSync(dataDir, { recursive: true });

const client = process.env.GROQ_API_KEY ? new Groq({ timeout: 60_000, maxRetries: 1 }) : null;
if (!client) console.warn('GROQ_API_KEY is not set: AI summaries are disabled.');

const db = openDb(fileURLToPath(new URL('tracker.db', dataDir)));

// No auth in this app, so stay on loopback.
createApp(db, createSummarizer(client)).listen(3000, '127.0.0.1', () =>
  console.log('API on http://127.0.0.1:3000'),
);
