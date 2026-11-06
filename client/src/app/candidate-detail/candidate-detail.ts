import { DatePipe } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Candidate, CandidateApi, CandidateChange, DocumentField, DOCUMENTS, errorMessage, Stage, STAGES } from '../candidate';
import { ConfirmService } from '../confirm';
import { SummaryPanel } from '../summary-panel/summary-panel';

@Component({
  selector: 'app-candidate-detail',
  imports: [DatePipe, FormsModule, ReactiveFormsModule, RouterLink, SummaryPanel],
  templateUrl: './candidate-detail.html',
})
export class CandidateDetail {
  private api = inject(CandidateApi);
  private router = inject(Router);
  private confirm = inject(ConfirmService);

  readonly id = input.required<string>();

  protected readonly stages = STAGES;
  protected readonly documents = DOCUMENTS;
  protected readonly candidate = httpResource<Candidate>(() => `/api/candidates/${this.id()}`);
  protected readonly noteBody = signal('');
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly editing = signal(false);
  protected readonly details = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.maxLength(40)],
    role: ['', [Validators.required, Validators.maxLength(200)]],
    source: ['', Validators.maxLength(100)],
  });
  private readonly panel = viewChild(SummaryPanel);

  // Includes the summary call, so a slow old reply cannot overwrite a newer change.
  protected readonly documentsBusy = computed(() => this.saving() || !!this.panel()?.loading());

  private readonly fail = (err: HttpErrorResponse) => this.error.set(errorMessage(err));

  private update(change: CandidateChange, done?: () => void) {
    this.error.set('');
    this.api.update(this.candidate.value()!.id, change).subscribe({
      next: (updated) => {
        this.candidate.set(updated);
        done?.();
      },
      error: (err) => {
        this.fail(err);
        done?.();
        this.candidate.reload(); // puts the stage dropdown back to what the server has
      },
    });
  }

  protected moveTo(stage: Stage) {
    this.update({ stage });
  }

  protected setArchived(archived: boolean) {
    this.update({ archived });
  }

  protected startEditing() {
    const { name, email, phone, role, source } = this.candidate.value()!;
    this.details.reset({ name, email, phone: phone ?? '', role, source: source ?? '' });
    this.error.set('');
    this.editing.set(true);
  }

  protected invalid(name: keyof typeof this.details.controls) {
    const control = this.details.controls[name];
    return control.invalid && control.touched;
  }

  protected saveDetails() {
    if (this.details.invalid) {
      this.details.markAllAsTouched();
      return;
    }
    this.error.set('');
    this.saving.set(true);
    this.api.update(this.candidate.value()!.id, this.details.getRawValue()).subscribe({
      next: (updated) => {
        this.candidate.set(updated);
        this.saving.set(false);
        this.editing.set(false);
      },
      error: (err) => {
        this.saving.set(false);
        this.fail(err); // stays open, so what was typed is not lost
      },
    });
  }

  private setDocument(field: DocumentField, text: string) {
    this.saving.set(true);
    this.update({ [field]: text }, () => {
      this.saving.set(false);
      if (this.candidate.value()?.[field] === text) this.panel()?.refresh();
    });
  }

  protected upload(event: Event, field: DocumentField) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    this.saving.set(true);
    this.api.extractText(file).subscribe({
      next: ({ text }) => this.setDocument(field, text),
      error: (err) => {
        this.saving.set(false);
        this.fail(err);
      },
    });
    input.value = ''; // so picking the same file again still fires a change event
  }

  protected async removeDocument(field: DocumentField, title: string) {
    const question = `Remove the ${title.toLowerCase()}? This cannot be undone.`;
    if (!(await this.confirm.ask(question, 'Remove'))) return;
    this.setDocument(field, '');
  }

  protected async remove() {
    const { id, name } = this.candidate.value()!;
    const question = `Permanently delete ${name}, with their notes and summary? This cannot be undone.`;
    if (!(await this.confirm.ask(question, 'Delete'))) return;
    this.api.delete(id).subscribe({ next: () => this.router.navigate(['/']), error: this.fail });
  }

  protected addNote() {
    const body = this.noteBody().trim();
    if (!body) return;
    this.error.set('');
    this.api.addNote(this.candidate.value()!.id, body).subscribe({
      next: (note) => {
        this.candidate.update((c) => c && { ...c, notes: [note, ...c.notes] });
        this.noteBody.set('');
      },
      error: this.fail,
    });
  }
}
