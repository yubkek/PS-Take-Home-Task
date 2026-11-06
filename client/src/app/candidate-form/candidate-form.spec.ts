import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ConfirmService } from '../confirm';
import { CandidateForm } from './candidate-form';

describe('CandidateForm', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function render() {
    const fixture = TestBed.createComponent(CandidateForm);
    fixture.detectChanges();
    http.expectOne('/api/roles').flush([]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const type = (name: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`[formControlName=${name}],[name=${name}]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const upload = (file: File, index = 0) => {
      const input = el.querySelectorAll<HTMLInputElement>('input[type=file]')[index];
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    return { fixture, el, type, upload };
  }

  it('does not submit an invalid form and shows why', async () => {
    const { fixture, el } = await render();
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    http.expectNone('/api/candidates');
    expect(el.querySelectorAll('.field-error').length).toBe(3);
  });

  it('submits a valid form and opens the new candidate', async () => {
    const { fixture, el, type } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    type('name', 'Ada');
    type('email', 'ada@example.com');
    type('role', 'Engineer');
    type('resumeText', 'Pasted resume');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));

    const request = http.expectOne('/api/candidates');
    expect(request.request.body.name).toBe('Ada');
    expect(request.request.body.resumeText).toBe('Pasted resume');
    request.flush({ id: 5 });
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/candidates', 5]);
  });

  it('shows the server error and allows another attempt', async () => {
    const { fixture, el, type } = await render();
    type('name', 'Ada');
    type('email', 'ada@example.com');
    type('role', 'Engineer');
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    http
      .expectOne('/api/candidates')
      .flush({ error: 'Invalid request' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Invalid request');
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);
  });

  const pdf = new File(['%PDF-'], 'cv.pdf', { type: 'application/pdf' });

  it('uploads a resume and a cover letter separately and submits both', async () => {
    const { fixture, el, type, upload } = await render();
    type('name', 'Ada');
    type('email', 'ada@example.com');
    type('role', 'Engineer');

    upload(pdf, 0);
    const request = http.expectOne('/api/resume-text');
    expect(request.request.body).toBe(pdf);
    request.flush({ text: 'My resume' });
    await fixture.whenStable();
    const [resume, letter] = Array.from(el.querySelectorAll('textarea'));
    expect(resume.value).toBe('My resume');
    expect(letter.value).toBe('');

    upload(new File(['x'], 'letter.docx'), 1);
    http.expectOne('/api/resume-text').flush({ text: 'My letter' });
    await fixture.whenStable();
    expect(letter.value).toBe('My letter');
    expect(el.textContent).toContain('Text from letter.docx');

    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    const save = http.expectOne('/api/candidates');
    expect(save.request.body.resumeText).toBe('My resume');
    expect(save.request.body.coverLetterText).toBe('My letter');
  });

  it('removes a document and its file name, leaving the other alone', async () => {
    const { fixture, el, type, upload } = await render();
    upload(pdf, 0);
    http.expectOne('/api/resume-text').flush({ text: 'My resume' });
    type('coverLetterText', 'Dear team');
    await fixture.whenStable();

    el.querySelector<HTMLButtonElement>('[aria-label="Remove Resume"]')!.click();
    await fixture.whenStable();
    const [resume, letter] = Array.from(el.querySelectorAll('textarea'));
    expect(resume.value).toBe('');
    expect(letter.value).toBe('Dear team');
    expect(el.textContent).not.toContain('Text from cv.pdf');
    expect(el.querySelector('[aria-label="Remove Resume"]')).toBeNull();
  });

  it('holds back saving while a file is being read', async () => {
    const { fixture, el, upload } = await render();
    upload(pdf);
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    http.expectOne('/api/resume-text').flush({ text: 'x' });
  });

  it('keeps what was typed and shows why when a file cannot be read', async () => {
    const { fixture, el, type, upload } = await render();
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    type('coverLetterText', 'Dear team');
    upload(pdf, 1);
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/resume-text').flush({ error: 'No text found' }, { status: 422, statusText: 'Unprocessable' });
    await fixture.whenStable();
    expect(el.querySelectorAll('textarea')[1].value).toBe('Dear team');
    expect(el.querySelector('[role=alert]')?.textContent).toContain('No text found');
  });

  it('asks before an upload replaces text in the box', async () => {
    const { el, type, upload } = await render();
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    type('coverLetterText', 'Dear team');
    upload(pdf, 1);
    await new Promise((resolve) => setTimeout(resolve));
    http.expectNone('/api/resume-text');
    expect(el.querySelectorAll('textarea')[1].value).toBe('Dear team');
  });
});
