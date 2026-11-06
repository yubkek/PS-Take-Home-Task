import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Candidate, Summary } from '../candidate';
import { ConfirmService } from '../confirm';
import { CandidateDetail } from './candidate-detail';

const oldSummary: Summary = {
  status: 'ok',
  headline: 'Old headline',
  skills: [],
  highlights: [],
  warnings: [],
  model: 'test',
  generatedAt: '2026-01-01T00:00:00.000Z',
};
const newSummary = { ...oldSummary, headline: 'New headline' };

const candidate: Candidate = {
  id: 7,
  name: 'Ada',
  email: 'a@b.c',
  phone: null,
  role: 'Engineer',
  stage: 'Applied',
  source: null,
  createdAt: '2026-01-01T00:00:00Z',
  archivedAt: null,
  resumeText: 'Old resume',
  coverLetterText: '',
  notes: [],
  summary: oldSummary,
};

const flush = () => new Promise((resolve) => setTimeout(resolve));

describe('CandidateDetail documents', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(CandidateDetail);
    fixture.componentRef.setInput('id', '7');
    fixture.detectChanges();
    http.expectOne('/api/candidates/7').flush(candidate);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const upload = (index: number) => {
      const input = el.querySelectorAll<HTMLInputElement>('input[type=file]')[index];
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'cv.pdf')], configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    return { fixture, el, upload };
  }

  it('saves a new upload and regenerates the summary without being asked', async () => {
    const { fixture, el, upload } = await render();
    upload(0);
    http.expectOne('/api/resume-text').flush({ text: 'New resume' });

    const patch = http.expectOne('/api/candidates/7');
    expect(patch.request.body).toEqual({ resumeText: 'New resume' });
    patch.flush({ ...candidate, resumeText: 'New resume', summary: null });
    await fixture.whenStable().catch(() => {});
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Old headline');

    http.expectOne('/api/candidates/7/summary').flush(newSummary);
    await fixture.whenStable();
    expect(el.textContent).toContain('New headline');
    expect(el.textContent).toContain('New resume');
  });

  it('stores a cover letter upload in its own field', async () => {
    const { upload } = await render();
    upload(1);
    http.expectOne('/api/resume-text').flush({ text: 'Dear team' });
    const patch = http.expectOne('/api/candidates/7');
    expect(patch.request.body).toEqual({ coverLetterText: 'Dear team' });
    patch.flush({ ...candidate, coverLetterText: 'Dear team', summary: null });
    http.expectOne('/api/candidates/7/summary').flush(newSummary);
  });

  it('removes a document after asking, then regenerates', async () => {
    const { fixture, el } = await render();
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('[aria-label="Remove Resume"]')!.click();
    await flush();
    expect(ask).toHaveBeenCalled();

    const patch = http.expectOne('/api/candidates/7');
    expect(patch.request.body).toEqual({ resumeText: '' });
    patch.flush({ ...candidate, resumeText: '', summary: null });
    http.expectOne('/api/candidates/7/summary').flush(newSummary);
    await fixture.whenStable();
    expect(el.textContent).toContain('No resume on file');
  });

  it('changes nothing when the removal is cancelled', async () => {
    const { el } = await render();
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    el.querySelector<HTMLButtonElement>('[aria-label="Remove Resume"]')!.click();
    await flush();
    http.expectNone('/api/candidates/7');
  });

  it('deletes the candidate after confirming and returns to the list', async () => {
    const { el } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('button.danger')!.click();
    await flush();
    expect(ask.mock.calls[0]![0]).toContain('Permanently delete Ada');
    const request = http.expectOne('/api/candidates/7');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('does not delete when the popup is cancelled', async () => {
    const { el } = await render();
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    el.querySelector<HTMLButtonElement>('button.danger')!.click();
    await flush();
    http.expectNone('/api/candidates/7');
  });

  it('shows why when the delete fails', async () => {
    const { fixture, el } = await render();
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('button.danger')!.click();
    await flush();
    http.expectOne('/api/candidates/7').flush({ error: 'Nope' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Nope');
  });

  it('keeps the document and summary and shows why when a file cannot be read', async () => {
    const { fixture, el, upload } = await render();
    upload(0);
    http.expectOne('/api/resume-text').flush({ error: 'No text found' }, { status: 422, statusText: 'Unprocessable' });
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('No text found');
    expect(el.textContent).toContain('Old resume');
    expect(el.textContent).toContain('Old headline');
  });

  it('does not regenerate when the save fails', async () => {
    const { fixture, el, upload } = await render();
    upload(0);
    http.expectOne('/api/resume-text').flush({ text: 'New resume' });
    http.expectOne('/api/candidates/7').flush({ error: 'Nope' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    http.expectOne('/api/candidates/7').flush(candidate); // puts the page back to what the server has
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Nope');
    expect(el.textContent).toContain('Old headline');
  });

  it('locks the document controls while a summary is generating', async () => {
    const { fixture, el, upload } = await render();
    upload(0);
    http.expectOne('/api/resume-text').flush({ text: 'New resume' });
    http.expectOne('/api/candidates/7').flush({ ...candidate, resumeText: 'New resume', summary: null });
    fixture.detectChanges();
    expect(el.querySelector<HTMLInputElement>('input[type=file]')!.disabled).toBe(true);
    http.expectOne('/api/candidates/7/summary').flush(newSummary);
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('input[type=file]')!.disabled).toBe(false);
  });
});

describe('CandidateDetail editing details', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  async function openEditor() {
    const fixture = TestBed.createComponent(CandidateDetail);
    fixture.componentRef.setInput('id', '7');
    fixture.detectChanges();
    http.expectOne('/api/candidates/7').flush({ ...candidate, phone: '123' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[aria-label="Edit details"]')!.click();
    await fixture.whenStable();
    const field = (name: string) => el.querySelector<HTMLInputElement>(`[formControlName=${name}]`)!;
    const type = (name: string, value: string) => {
      field(name).value = value;
      field(name).dispatchEvent(new Event('input'));
    };
    const save = () => el.querySelector('section form')!.dispatchEvent(new Event('submit'));
    return { fixture, el, field, type, save };
  }

  it('opens filled in with the current details', async () => {
    const { field } = await openEditor();
    expect(field('name').value).toBe('Ada');
    expect(field('email').value).toBe('a@b.c');
    expect(field('phone').value).toBe('123');
    expect(field('source').value).toBe('');
  });

  it('saves the changes, then shows them and closes', async () => {
    const { fixture, el, type, save } = await openEditor();
    type('name', 'Grace');
    type('phone', '');
    save();
    const request = http.expectOne('/api/candidates/7');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Grace', email: 'a@b.c', phone: '', role: 'Engineer', source: '' });
    request.flush({ ...candidate, name: 'Grace' });
    await fixture.whenStable();
    expect(el.querySelector('h1')!.textContent).toBe('Grace');
    expect(el.querySelector('[formControlName=name]')).toBeNull();
  });

  it('does not save invalid details and shows why', async () => {
    const { fixture, el, type, save } = await openEditor();
    type('email', 'not-an-email');
    save();
    await fixture.whenStable();
    http.expectNone('/api/candidates/7');
    expect(el.textContent).toContain('Enter a valid email address.');
  });

  it('discards changes on Cancel', async () => {
    const { fixture, el, type } = await openEditor();
    type('name', 'Grace');
    Array.from(el.querySelectorAll<HTMLButtonElement>('section form button')).find((b) => b.textContent === 'Cancel')!.click();
    await fixture.whenStable();
    expect(el.querySelector('h1')!.textContent).toBe('Ada');
    el.querySelector<HTMLButtonElement>('[aria-label="Edit details"]')!.click();
    await fixture.whenStable();
    expect(el.querySelector<HTMLInputElement>('[formControlName=name]')!.value).toBe('Ada');
  });

  it('stays open with what was typed when saving fails', async () => {
    const { fixture, el, field, type, save } = await openEditor();
    type('name', 'Grace');
    save();
    http.expectOne('/api/candidates/7').flush({ error: 'Nope' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Nope');
    expect(field('name').value).toBe('Grace');
  });
});
