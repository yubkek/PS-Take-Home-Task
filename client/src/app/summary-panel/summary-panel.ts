import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { CandidateApi, errorMessage, Summary } from '../candidate';

// The AI feature's UI: generates on first view, then shows the stored result.
@Component({
  selector: 'app-summary-panel',
  imports: [DatePipe],
  templateUrl: './summary-panel.html',
})
export class SummaryPanel implements OnInit {
  private api = inject(CandidateApi);

  readonly candidateId = input.required<number>();
  readonly initial = input.required<Summary | null>();

  protected readonly summary = signal<Summary | null>(null);
  readonly loading = signal(false);
  protected readonly error = signal('');

  ngOnInit() {
    this.summary.set(this.initial());
    if (!this.summary()) this.generate();
  }

  // For when the documents change and the summary on screen is stale.
  refresh() {
    this.summary.set(null);
    this.generate();
  }

  protected generate() {
    this.loading.set(true);
    this.error.set('');
    this.api.generateSummary(this.candidateId()).subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }
}
