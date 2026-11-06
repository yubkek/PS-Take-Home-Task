import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { SummaryError } from './ai/summarizer.ts';
import type { Summarize } from './ai/summarizer.ts';
import { candidateRepo } from './candidates.ts';
import { ExtractError, extractResumeText } from './extract.ts';
import {
  createCandidateSchema,
  createNoteSchema,
  idSchema,
  listQuerySchema,
  updateCandidateSchema,
} from './schema.ts';

export function createApp(db: DatabaseSync, summarize: Summarize) {
  const repo = candidateRepo(db);
  const app = express();
  app.use(express.json({ limit: '600kb' }));

  const notFound = (res: Response) => res.status(404).json({ error: 'Candidate not found' });

  app.get('/api/roles', (_req, res) => {
    res.json(repo.roles());
  });

  app.post('/api/resume-text', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
    res.json({ text: await extractResumeText(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)) });
  });

  app.get('/api/candidates', (req, res) => {
    res.json(repo.list(listQuerySchema.parse(req.query)));
  });

  app.post('/api/candidates', (req, res) => {
    res.status(201).json(repo.create(createCandidateSchema.parse(req.body)));
  });

  app.get('/api/candidates/:id', (req, res) => {
    const candidate = repo.get(idSchema.parse(req.params.id));
    if (!candidate) return notFound(res);
    res.json(candidate);
  });

  app.patch('/api/candidates/:id', (req, res) => {
    const candidate = repo.update(idSchema.parse(req.params.id), updateCandidateSchema.parse(req.body));
    if (!candidate) return notFound(res);
    res.json(candidate);
  });

  app.delete('/api/candidates/:id', (req, res) => {
    if (!repo.delete(idSchema.parse(req.params.id))) return notFound(res);
    res.status(204).end();
  });

  app.post('/api/candidates/:id/notes', (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { body } = createNoteSchema.parse(req.body);
    if (!repo.get(id)) return notFound(res);
    res.status(201).json(repo.addNote(id, body));
  });

  app.post('/api/candidates/:id/summary', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const candidate = repo.get(id);
    if (!candidate) return notFound(res);
    const document = [candidate.resumeText, candidate.coverLetterText].filter(Boolean).join('\n\n');
    const summary = await summarize(document);
    repo.saveSummary(id, summary);
    res.json(summary);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: z.flattenError(err) });
    }
    if (err instanceof ExtractError) return res.status(422).json({ error: err.message });
    if (err instanceof SummaryError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    // body-parser errors (malformed JSON, payload too large) carry their own 4xx status
    const status = (err as { status?: number }).status;
    if (status && status < 500) return res.status(status).json({ error: (err as Error).message });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
