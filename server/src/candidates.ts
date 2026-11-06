import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { STAGES } from './schema.ts';
import type { CandidateUpdate, ListQuery, NewCandidate, Summary } from './schema.ts';

const LIST_COLUMNS = `id, name, email, phone, role, stage, source,
  created_at AS createdAt, archived_at AS archivedAt`;

// Built from the constant, never from user input.
const STAGE_RANK = `CASE stage ${STAGES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} END`;

export function candidateRepo(db: DatabaseSync) {
  const get = (id: number) => {
    const candidate = db
      .prepare(`SELECT ${LIST_COLUMNS}, resume_text AS resumeText, cover_letter_text AS coverLetterText
         FROM candidates WHERE id = ?`)
      .get(id);
    if (!candidate) return undefined;

    const notes = db
      .prepare(
        `SELECT id, body, created_at AS createdAt FROM notes
         WHERE candidate_id = ? ORDER BY id DESC`,
      )
      .all(id);
    const summary = db.prepare('SELECT data FROM summaries WHERE candidate_id = ?').get(id);
    return {
      ...candidate,
      resumeText: candidate.resumeText as string,
      coverLetterText: candidate.coverLetterText as string,
      notes,
      summary: summary ? (JSON.parse(summary.data as string) as Summary) : null,
    };
  };

  return {
    get,

    list({ stage, role, sort, order, archived }: ListQuery) {
      const where = [archived ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'];
      const params: SQLInputValue[] = [];
      if (stage) {
        where.push('stage = ?');
        params.push(stage);
      }
      if (role) {
        where.push('role = ? COLLATE NOCASE');
        params.push(role);
      }
      const direction = order === 'asc' ? 'ASC' : 'DESC';
      const orderBy = sort === 'stage' ? STAGE_RANK : 'created_at';
      return db
        .prepare(
          `SELECT ${LIST_COLUMNS} FROM candidates WHERE ${where.join(' AND ')}
           ORDER BY ${orderBy} ${direction}, id ${direction}`,
        )
        .all(...params);
    },

    roles() {
      return db
        .prepare('SELECT DISTINCT role COLLATE NOCASE AS role FROM candidates ORDER BY 1')
        .all()
        .map((r) => r.role as string);
    },

    create(c: NewCandidate) {
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO candidates
             (name, email, phone, role, resume_text, cover_letter_text, stage, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          c.name,
          c.email,
          c.phone,
          c.role,
          c.resumeText,
          c.coverLetterText,
          c.stage,
          c.source,
          new Date().toISOString(),
        );
      return get(Number(lastInsertRowid))!;
    },

    update(id: number, change: CandidateUpdate) {
      const { stage, archived, resumeText, coverLetterText } = change;
      // All or nothing: a failure part-way rolls everything back.
      db.exec('BEGIN');
      try {
        for (const column of ['name', 'email', 'phone', 'role', 'source'] as const) {
          const value = change[column];
          if (value !== undefined) db.prepare(`UPDATE candidates SET ${column} = ? WHERE id = ?`).run(value, id);
        }
        if (stage !== undefined) db.prepare('UPDATE candidates SET stage = ? WHERE id = ?').run(stage, id);
        if (archived !== undefined) {
          db.prepare('UPDATE candidates SET archived_at = ? WHERE id = ?').run(
            archived ? new Date().toISOString() : null,
            id,
          );
        }
        if (resumeText !== undefined) {
          db.prepare('UPDATE candidates SET resume_text = ? WHERE id = ?').run(resumeText, id);
        }
        if (coverLetterText !== undefined) {
          db.prepare('UPDATE candidates SET cover_letter_text = ? WHERE id = ?').run(coverLetterText, id);
        }
        // A summary of the old text must not outlive it, even if regenerating then fails.
        if (resumeText !== undefined || coverLetterText !== undefined) {
          db.prepare('DELETE FROM summaries WHERE candidate_id = ?').run(id);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return get(id);
    },

    delete(id: number) {
      return db.prepare('DELETE FROM candidates WHERE id = ?').run(id).changes > 0;
    },

    addNote(candidateId: number, body: string) {
      const createdAt = new Date().toISOString();
      const { lastInsertRowid } = db
        .prepare('INSERT INTO notes (candidate_id, body, created_at) VALUES (?, ?, ?)')
        .run(candidateId, body, createdAt);
      return { id: Number(lastInsertRowid), body, createdAt };
    },

    saveSummary(candidateId: number, summary: Summary) {
      db.prepare('INSERT OR REPLACE INTO summaries (candidate_id, data) VALUES (?, ?)').run(
        candidateId,
        JSON.stringify(summary),
      );
    },
  };
}
