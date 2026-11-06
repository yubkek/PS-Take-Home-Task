import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CandidateApi, CandidateListItem, errorMessage, Stage, STAGES } from '../candidate';

@Component({
  selector: 'app-candidate-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './candidate-list.html',
})
export class CandidateList {
  private api = inject(CandidateApi);

  protected readonly stages = STAGES;

  protected readonly stage = signal('');
  protected readonly role = signal('');
  protected readonly sort = signal('date:desc');
  protected readonly archived = signal(false);
  protected readonly error = signal('');

  protected readonly filtered = computed(() => !!this.stage() || !!this.role());

  protected readonly roles = httpResource<string[]>(() => '/api/roles', { defaultValue: [] });

  // Re-fetches whenever a signal it reads changes.
  protected readonly candidates = httpResource<CandidateListItem[]>(() => {
    const [sort, order] = this.sort().split(':');
    const params: Record<string, string | boolean> = { sort, order, archived: this.archived() };
    if (this.stage()) params['stage'] = this.stage();
    if (this.role()) params['role'] = this.role();
    return { url: '/api/candidates', params };
  });

  protected moveTo(candidate: CandidateListItem, select: HTMLSelectElement) {
    this.error.set('');
    this.api.update(candidate.id, { stage: select.value as Stage }).subscribe({
      // Reload, not patch: a move can change sort order or filter matches.
      next: () => this.candidates.reload(),
      error: (err) => {
        select.value = candidate.stage;
        this.error.set(errorMessage(err));
      },
    });
  }

  protected clearFilters() {
    this.stage.set('');
    this.role.set('');
  }
}
