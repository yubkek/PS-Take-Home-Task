import { DatabaseSync } from 'node:sqlite';
import { STAGES } from './schema.ts';

const stageList = STAGES.map((s) => `'${s}'`).join(', ');

export function openDb(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL,
      resume_text TEXT NOT NULL DEFAULT '',
      cover_letter_text TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL CHECK (stage IN (${stageList})),
      source TEXT,
      created_at TEXT NOT NULL,
      archived_at TEXT
    );

    -- Append-only: the API exposes no update or delete for notes.
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Stored as JSON because it is only ever read whole, never queried by field.
    CREATE TABLE IF NOT EXISTS summaries (
      candidate_id INTEGER PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
      data TEXT NOT NULL
    );
  `);

  // Databases created before cover letters were stored separately.
  const columns = db.prepare('PRAGMA table_info(candidates)').all();
  if (!columns.some((c) => c.name === 'cover_letter_text')) {
    db.exec("ALTER TABLE candidates ADD COLUMN cover_letter_text TEXT NOT NULL DEFAULT ''");
  }
  return db;
}
