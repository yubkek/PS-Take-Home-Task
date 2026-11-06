import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmService } from '../confirm';
import { CandidateApi, DocumentField, DOCUMENTS, errorMessage, MAX_RESUME_CHARS } from '../candidate';

@Component({
  selector: 'app-candidate-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './candidate-form.html',
})
export class CandidateForm {
  private api = inject(CandidateApi);
  private router = inject(Router);
  private confirm = inject(ConfirmService);

  protected readonly documents = DOCUMENTS;
  protected readonly maxResumeChars = MAX_RESUME_CHARS;
  protected readonly roles = httpResource<string[]>(() => '/api/roles', { defaultValue: [] });

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.maxLength(40)],
    role: ['', [Validators.required, Validators.maxLength(200)]],
    source: ['', Validators.maxLength(100)],
    resumeText: ['', Validators.maxLength(MAX_RESUME_CHARS)],
    coverLetterText: ['', Validators.maxLength(MAX_RESUME_CHARS)],
  });

  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly fileErrors = signal<Partial<Record<DocumentField, string>>>({});
  protected readonly uploading = signal(false);
  protected readonly fileNames = signal<Partial<Record<DocumentField, string>>>({});

  protected async loadFile(event: Event, field: DocumentField) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so picking the same file again still fires a change event
    if (!file) return;
    const control = this.form.controls[field];
    if (control.value && !(await this.confirm.ask('Replace the text already there?', 'Replace'))) return;

    this.fileErrors.update((e) => ({ ...e, [field]: '' }));
    this.uploading.set(true);
    this.api.extractText(file).subscribe({
      next: ({ text }) => {
        this.uploading.set(false);
        this.fileNames.update((n) => ({ ...n, [field]: file.name }));
        control.setValue(text);
      },
      error: (err: HttpErrorResponse) => {
        this.uploading.set(false);
        this.fileErrors.update((e) => ({ ...e, [field]: errorMessage(err) }));
      },
    });
  }

  protected clear(field: DocumentField) {
    this.form.controls[field].setValue('');
    this.fileNames.update((n) => ({ ...n, [field]: '' }));
  }

  protected invalid(name: keyof typeof this.form.controls) {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.create(this.form.getRawValue()).subscribe({
      next: (candidate) => this.router.navigate(['/candidates', candidate.id]),
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
