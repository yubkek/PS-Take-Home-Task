import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, beforeEach, describe, it } from 'node:test';
import type { Server } from 'node:http';
import { SummaryError } from './ai/summarizer.ts';
import type { Summarize } from './ai/summarizer.ts';
import { createApp } from './app.ts';
import { candidateRepo } from './candidates.ts';
import { openDb } from './db.ts';
import type { Summary } from './schema.ts';

const summary: Summary = {
  status: 'ok',
  headline: 'An engineer.',
  skills: ['Go'],
  highlights: [],
  warnings: [],
  model: 'test',
  generatedAt: '2026-01-01T00:00:00.000Z',
};

let server: Server;
let base: string;
let summarize: Summarize;

const api = (path: string, method = 'GET', body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const add = async (overrides: object = {}) => {
  const res = await api('/api/candidates', 'POST', {
    name: 'Ada',
    email: 'ada@example.com',
    role: 'Engineer',
    ...overrides,
  });
  assert.equal(res.status, 201);
  return res.json() as Promise<any>;
};

const names = async (query: string) => {
  const res = await api(`/api/candidates?${query}`);
  return ((await res.json()) as { name: string }[]).map((c) => c.name);
};

beforeEach(async () => {
  server?.close();
  summarize = async () => summary;
  const app = createApp(openDb(':memory:'), (text) => summarize(text));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

describe('candidates API', () => {
  it('creates a candidate at Applied with optional fields empty', async () => {
    const created = await add({ phone: '  ', source: '' });
    assert.equal(created.stage, 'Applied');
    assert.equal(created.phone, null);
    assert.equal(created.source, null);
    assert.deepEqual(created.notes, []);
    assert.equal(created.summary, null);
  });

  it('rejects bad input with the field that failed', async () => {
    const res = await api('/api/candidates', 'POST', { name: 'Ada', email: 'nope', role: 'Engineer' });
    assert.equal(res.status, 400);
    assert.ok(((await res.json()) as any).details.fieldErrors.email);
  });

  it('rejects a resume over the limit instead of truncating it', async () => {
    const res = await api('/api/candidates', 'POST', {
      name: 'Ada',
      email: 'a@b.co',
      role: 'Engineer',
      resumeText: 'x'.repeat(50_001),
    });
    assert.equal(res.status, 400);
  });

  it('treats SQL in a filter as a plain value', async () => {
    await add();
    assert.deepEqual(await names(`role=${encodeURIComponent("x' OR '1'='1")}`), []);
    assert.deepEqual(await names('role=Engineer'), ['Ada']);
  });

  it('filters by stage and role together, ignoring role case', async () => {
    await add({ name: 'A', role: 'Engineer', stage: 'Offer' });
    await add({ name: 'B', role: 'Engineer', stage: 'Applied' });
    await add({ name: 'C', role: 'Designer', stage: 'Offer' });
    assert.deepEqual(await names('stage=Offer&role=engineer'), ['A']);
  });

  it('sorts by pipeline order, not alphabetically', async () => {
    await add({ name: 'interview', stage: 'Interview' });
    await add({ name: 'screening', stage: 'Screening' });
    await add({ name: 'applied', stage: 'Applied' });
    assert.deepEqual(await names('sort=stage&order=asc'), ['applied', 'screening', 'interview']);
    assert.deepEqual(await names('sort=stage&order=desc'), ['interview', 'screening', 'applied']);
  });

  it('sorts by date, newest first by default, stable within the same millisecond', async () => {
    await add({ name: 'first' });
    await add({ name: 'second' });
    assert.deepEqual(await names(''), ['second', 'first']);
    assert.deepEqual(await names('order=asc'), ['first', 'second']);
  });

  it('moves a candidate to any stage, including backwards', async () => {
    const { id } = await add({ stage: 'Offer' });
    const res = await api(`/api/candidates/${id}`, 'PATCH', { stage: 'Screening' });
    assert.equal(((await res.json()) as any).stage, 'Screening');
  });

  it('rejects an unknown stage', async () => {
    const { id } = await add();
    assert.equal((await api(`/api/candidates/${id}`, 'PATCH', { stage: 'Hired' })).status, 400);
  });

  it('archiving hides a candidate from the default list and is reversible', async () => {
    const { id } = await add();
    await api(`/api/candidates/${id}`, 'PATCH', { archived: true });
    assert.deepEqual(await names(''), []);
    assert.deepEqual(await names('archived=true'), ['Ada']);
    await api(`/api/candidates/${id}`, 'PATCH', { archived: false });
    assert.deepEqual(await names(''), ['Ada']);
  });

  it('keeps notes newest first, timestamped, and offers no way to change one', async () => {
    const { id } = await add();
    await api(`/api/candidates/${id}/notes`, 'POST', { body: 'one' });
    const res = await api(`/api/candidates/${id}/notes`, 'POST', { body: 'two' });
    const note = (await res.json()) as any;
    assert.ok(!Number.isNaN(Date.parse(note.createdAt)));

    const detail = (await (await api(`/api/candidates/${id}`)).json()) as any;
    assert.deepEqual(detail.notes.map((n: any) => n.body), ['two', 'one']);

    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      assert.equal((await api(`/api/candidates/${id}/notes/${note.id}`, method, {})).status, 404);
    }
  });

  it('rejects a blank note', async () => {
    const { id } = await add();
    assert.equal((await api(`/api/candidates/${id}/notes`, 'POST', { body: '   ' })).status, 400);
  });

  it('deleting a candidate removes their notes and summary', async () => {
    const { id } = await add();
    await api(`/api/candidates/${id}/notes`, 'POST', { body: 'x' });
    await api(`/api/candidates/${id}/summary`, 'POST');
    assert.equal((await api(`/api/candidates/${id}`, 'DELETE')).status, 204);
    assert.equal((await api(`/api/candidates/${id}`)).status, 404);
    assert.equal((await api(`/api/candidates/${id}`, 'DELETE')).status, 404);
  });

  it('returns 400 for a malformed id or body, not 500', async () => {
    assert.equal((await api('/api/candidates/abc')).status, 400);
    const res = await fetch(`${base}/api/candidates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{oops',
    });
    assert.equal(res.status, 400);
  });
});

describe('summary endpoint', () => {
  it('passes the stored resume through and persists the result', async () => {
    let received = '';
    summarize = async (text) => ((received = text), summary);
    const { id } = await add({ resumeText: 'my resume' });
    assert.equal((await api(`/api/candidates/${id}/summary`, 'POST')).status, 200);
    assert.equal(received, 'my resume');
    const detail = (await (await api(`/api/candidates/${id}`)).json()) as any;
    assert.deepEqual(detail.summary, summary);
  });

  it('summarises the resume and cover letter together', async () => {
    let received = '';
    summarize = async (text) => ((received = text), summary);
    const { id } = await add({ resumeText: 'my resume', coverLetterText: 'my letter' });
    await api(`/api/candidates/${id}/summary`, 'POST');
    assert.equal(received, 'my resume\n\nmy letter');
  });

  it('keeps the previous summary and reports the error when regeneration fails', async () => {
    const { id } = await add();
    await api(`/api/candidates/${id}/summary`, 'POST');
    summarize = async () => {
      throw new SummaryError('ai_failed', 502, 'nope');
    };
    const res = await api(`/api/candidates/${id}/summary`, 'POST');
    assert.equal(res.status, 502);
    assert.equal(((await res.json()) as any).code, 'ai_failed');
    const detail = (await (await api(`/api/candidates/${id}`)).json()) as any;
    assert.deepEqual(detail.summary, summary);
  });

  it('returns 404 for an unknown candidate', async () => {
    assert.equal((await api('/api/candidates/999/summary', 'POST')).status, 404);
  });
});

describe('stored documents', () => {
  it('keeps the resume and cover letter apart, and out of the list', async () => {
    const { id } = await add({ resumeText: 'my resume', coverLetterText: 'my letter' });
    const detail = (await (await api(`/api/candidates/${id}`)).json()) as any;
    assert.equal(detail.resumeText, 'my resume');
    assert.equal(detail.coverLetterText, 'my letter');
    const [row] = (await (await api('/api/candidates')).json()) as any[];
    assert.equal('coverLetterText' in row, false);
  });

  it('replaces or removes one document and drops the summary made from it', async () => {
    const { id } = await add({ resumeText: 'old resume', coverLetterText: 'my letter' });
    await api(`/api/candidates/${id}/summary`, 'POST');
    await api(`/api/candidates/${id}/notes`, 'POST', { body: 'A note' });

    const replaced = (await (await api(`/api/candidates/${id}`, 'PATCH', { resumeText: 'new resume' })).json()) as any;
    assert.equal(replaced.resumeText, 'new resume');
    assert.equal(replaced.coverLetterText, 'my letter');
    assert.equal(replaced.summary, null);
    assert.equal(replaced.notes.length, 1);

    const removed = (await (await api(`/api/candidates/${id}`, 'PATCH', { coverLetterText: '' })).json()) as any;
    assert.equal(removed.coverLetterText, '');
    assert.equal(removed.resumeText, 'new resume');
  });

  it('keeps the summary when only the stage changes', async () => {
    const { id } = await add({ resumeText: 'my resume' });
    await api(`/api/candidates/${id}/summary`, 'POST');
    const moved = (await (await api(`/api/candidates/${id}`, 'PATCH', { stage: 'Offer' })).json()) as any;
    assert.deepEqual(moved.summary, summary);
  });

  it('refuses a replacement over the length limit', async () => {
    const { id } = await add();
    const res = await api(`/api/candidates/${id}`, 'PATCH', { resumeText: 'x'.repeat(50_001) });
    assert.equal(res.status, 400);
  });

  it('accepts both documents at their maximum length, even in the largest JSON encoding', async () => {
    await add({ resumeText: '\u0001'.repeat(50_000), coverLetterText: '\u0001'.repeat(50_000) });
  });

  it('adds the cover letter column to a database from before it existed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tracker-'));
    const path = join(dir, 'old.db');
    const old = new DatabaseSync(path);
    old.exec("CREATE TABLE candidates (id INTEGER PRIMARY KEY, name TEXT, resume_text TEXT NOT NULL DEFAULT '')");
    old.exec("INSERT INTO candidates (name, resume_text) VALUES ('Ada', 'kept')");
    old.close();

    const db = openDb(path);
    const row = db.prepare('SELECT resume_text, cover_letter_text FROM candidates').get();
    db.close();
    rmSync(dir, { recursive: true });
    assert.deepEqual({ ...row }, { resume_text: 'kept', cover_letter_text: '' });
  });
});

describe('editing candidate details', () => {
  const patch = async (id: number, body: object) => {
    const res = await api(`/api/candidates/${id}`, 'PATCH', body);
    return { status: res.status, body: (await res.json()) as any };
  };

  it('updates the details and leaves everything else alone', async () => {
    const { id } = await add({ phone: '123', source: 'Referral', resumeText: 'my resume' });
    await api(`/api/candidates/${id}/summary`, 'POST');
    await api(`/api/candidates/${id}/notes`, 'POST', { body: 'A note' });

    const { status, body } = await patch(id, { name: 'Grace', email: 'grace@example.com', role: 'Lead', phone: '456', source: 'LinkedIn' });
    assert.equal(status, 200);
    assert.deepEqual(
      [body.name, body.email, body.role, body.phone, body.source],
      ['Grace', 'grace@example.com', 'Lead', '456', 'LinkedIn'],
    );
    assert.equal(body.resumeText, 'my resume');
    assert.equal(body.stage, 'Applied');
    assert.equal(body.notes.length, 1);
    assert.deepEqual(body.summary, summary);
  });

  it('clears an optional field when it is sent empty', async () => {
    const { id } = await add({ phone: '123', source: 'Referral' });
    const { body } = await patch(id, { phone: '', source: '' });
    assert.equal(body.phone, null);
    assert.equal(body.source, null);
  });

  it('does not wipe optional fields when something else changes', async () => {
    const { id } = await add({ phone: '123', source: 'Referral' });
    for (const change of [{ stage: 'Offer' }, { archived: true }, { name: 'Grace' }, { resumeText: 'new' }]) {
      const { body } = await patch(id, change);
      assert.equal(body.phone, '123');
      assert.equal(body.source, 'Referral');
    }
  });

  it('applies the same rules as adding a candidate', async () => {
    const { id } = await add();
    assert.equal((await patch(id, { email: 'not-an-email' })).status, 400);
    assert.equal((await patch(id, { name: '   ' })).status, 400);
    assert.equal((await patch(id, { role: '' })).status, 400);
    assert.equal((await patch(id, { name: 'x'.repeat(201) })).status, 400);
    assert.equal((await patch(id, { id: 99 })).status, 400);
  });

  it('treats text that looks like SQL as plain text', async () => {
    const { id } = await add();
    const name = "Robert'); DROP TABLE candidates;--";
    assert.equal((await patch(id, { name })).body.name, name);
    assert.equal((await names('')).length, 1);
  });
});

describe('update transaction', () => {
  it('changes nothing if a step fails halfway, and leaves the database usable', () => {
    const db = openDb(':memory:');
    const repo = candidateRepo(db);
    const created: any = repo.create({
      name: 'Ada',
      email: 'ada@example.com',
      phone: null,
      role: 'Engineer',
      resumeText: 'old resume',
      coverLetterText: '',
      stage: 'Applied',
      source: null,
    });
    const { id } = created;
    repo.saveSummary(id, summary);

    // Fails the last step, so every earlier step has already run.
    db.exec(`CREATE TRIGGER fail_last_step BEFORE DELETE ON summaries BEGIN SELECT RAISE(ABORT, 'boom'); END`);
    assert.throws(() => repo.update(id, { name: 'Grace', stage: 'Offer', resumeText: 'new resume' }), /boom/);

    const after = repo.get(id) as any;
    assert.deepEqual([after.name, after.stage, after.resumeText], ['Ada', 'Applied', 'old resume']);
    assert.deepEqual(after.summary, summary);

    db.exec('DROP TRIGGER fail_last_step');
    assert.equal((repo.update(id, { name: 'Grace' }) as any).name, 'Grace');
  });
});

describe('POST /api/resume-text', () => {
  const upload = (body: Blob | string) => fetch(`${base}/api/resume-text`, { method: 'POST', body });

  it('returns the text of an uploaded file', async () => {
    const res = await upload('Ada, engineer');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: 'Ada, engineer' });
  });

  it('explains a file it cannot read', async () => {
    const res = await upload(new Blob([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])]));
    assert.equal(res.status, 422);
    assert.match(((await res.json()) as { error: string }).error, /could not be read/);
  });

  it('refuses a file over the size limit', async () => {
    assert.equal((await upload(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]))).status, 413);
  });
});
