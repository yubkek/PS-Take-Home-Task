import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

export const STAGES = ['Applied', 'Screening', 'Interview', 'Offer', 'Rejected'] as const;
export type Stage = (typeof STAGES)[number];

export const MAX_RESUME_CHARS = 50_000;

export const DOCUMENTS = [
  { field: 'resumeText', title: 'Resume' },
  { field: 'coverLetterText', title: 'Cover letter' },
] as const;
export type DocumentField = (typeof DOCUMENTS)[number]['field'];

export interface CandidateListItem {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  stage: Stage;
  source: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface Note {
  id: number;
  body: string;
  createdAt: string;
}

export interface Summary {
  status: 'ok' | 'insufficient';
  headline: string;
  skills: string[];
  highlights: string[];
  warnings: string[];
  model: string | null;
  generatedAt: string;
}

export interface Candidate extends CandidateListItem {
  resumeText: string;
  coverLetterText: string;
  notes: Note[];
  summary: Summary | null;
}

export type CandidateDetails = Pick<NewCandidate, 'name' | 'email' | 'phone' | 'role' | 'source'>;
export type CandidateChange = Partial<Record<DocumentField, string>> &
  Partial<CandidateDetails> & { stage?: Stage; archived?: boolean };

export interface NewCandidate {
  name: string;
  email: string;
  phone: string;
  role: string;
  source: string;
  resumeText: string;
  coverLetterText: string;
}

export const errorMessage = (err: HttpErrorResponse) =>
  err.status === 413 ? 'That file is over 5 MB.' : (err.error?.error ?? 'Something went wrong. Try again.');

// Writes only; reads use httpResource in the components.
@Injectable({ providedIn: 'root' })
export class CandidateApi {
  private http = inject(HttpClient);

  create(candidate: NewCandidate) {
    return this.http.post<Candidate>('/api/candidates', candidate);
  }

  update(id: number, change: CandidateChange) {
    return this.http.patch<Candidate>(`/api/candidates/${id}`, change);
  }

  // Sends the file as the raw body; the server detects its type.
  extractText(file: File) {
    return this.http.post<{ text: string }>('/api/resume-text', file);
  }

  delete(id: number) {
    return this.http.delete<void>(`/api/candidates/${id}`);
  }

  addNote(id: number, body: string) {
    return this.http.post<Note>(`/api/candidates/${id}/notes`, { body });
  }

  generateSummary(id: number) {
    return this.http.post<Summary>(`/api/candidates/${id}/summary`, null);
  }
}
