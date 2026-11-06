// Usage: npm run seed [-- path/to/candidates.json]
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { candidateRepo } from './candidates.ts';
import { openDb } from './db.ts';
import { createCandidateSchema } from './schema.ts';

const dataDir = new URL('../data/', import.meta.url);
mkdirSync(dataDir, { recursive: true });
const db = openDb(fileURLToPath(new URL('tracker.db', dataDir)));
const repo = candidateRepo(db);

const file = process.argv[2]
  ? resolve(process.env.INIT_CWD ?? '.', process.argv[2])
  : fileURLToPath(new URL('../../seed/candidates.json', import.meta.url));

const { count } = db.prepare('SELECT COUNT(*) AS count FROM candidates').get() as { count: number };
if (count > 0) {
  console.log(`Database already has ${count} candidates, nothing seeded. Delete server/data to reseed.`);
} else {
  const candidates = z.array(createCandidateSchema).parse(JSON.parse(readFileSync(file, 'utf8')));
  candidates.forEach(repo.create);
  console.log(`Seeded ${candidates.length} candidates from ${file}`);
}
