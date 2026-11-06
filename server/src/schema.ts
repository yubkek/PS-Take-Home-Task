import { z } from 'zod';

export const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected'] as const;
export type Stage = (typeof STAGES)[number];

// Longer text is rejected, not truncated, which caps AI cost.
export const MAX_RESUME_CHARS = 50_000;

const optionalText = (max: number) =>
  z.string().trim().max(max).nullish().transform((v) => v || null);

export const createCandidateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  phone: optionalText(40),
  role: z.string().trim().min(1).max(200),
  resumeText: z.string().max(MAX_RESUME_CHARS).default(''),
  coverLetterText: z.string().max(MAX_RESUME_CHARS).default(''),
  stage: z.enum(STAGES).default('Applied'),
  source: optionalText(100),
});
export type NewCandidate = z.infer<typeof createCandidateSchema>;

export const updateCandidateSchema = z
  .strictObject({
    name: createCandidateSchema.shape.name.optional(),
    email: createCandidateSchema.shape.email.optional(),
    // Without .optional(), a missing phone or source becomes null and wipes the field.
    phone: createCandidateSchema.shape.phone.optional(),
    role: createCandidateSchema.shape.role.optional(),
    source: createCandidateSchema.shape.source.optional(),
    stage: z.enum(STAGES).optional(),
    archived: z.boolean().optional(),
    resumeText: z.string().max(MAX_RESUME_CHARS).optional(),
    coverLetterText: z.string().max(MAX_RESUME_CHARS).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type CandidateUpdate = z.infer<typeof updateCandidateSchema>;

export const listQuerySchema = z.object({
  stage: z.enum(STAGES).optional(),
  role: z.string().optional(),
  sort: z.enum(['date', 'stage']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  archived: z.stringbool().default(false),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const createNoteSchema = z.object({ body: z.string().trim().min(1).max(5000) });

export const idSchema = z.coerce.number().int().positive();

export interface Summary {
  // 'insufficient': the text cannot support a summary, so only warnings are shown.
  status: 'ok' | 'insufficient';
  headline: string;
  skills: string[];
  highlights: string[];
  warnings: string[];
  model: string | null;
  generatedAt: string;
}
