import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CandidateList } from './candidate-list';

describe('CandidateList', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });

  it('re-queries the API when a filter changes', async () => {
    const fixture = TestBed.createComponent(CandidateList);
    fixture.detectChanges();
    http.expectOne('/api/roles').flush(['Engineer']);
    http.expectOne((r) => r.url === '/api/candidates' && !r.params.has('stage')).flush([]);
    await fixture.whenStable();

    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    select.value = 'Offer';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    http.expectOne((r) => r.url === '/api/candidates' && r.params.get('stage') === 'Offer').flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No candidates match');
  });

  describe('stage dropdown on a row', () => {
    const row = { id: 7, name: 'Ada', email: 'a@b.c', phone: null, role: 'Engineer', stage: 'Applied', source: null, createdAt: '2026-01-01T00:00:00Z', archivedAt: null };

    async function rendered() {
      const fixture = TestBed.createComponent(CandidateList);
      fixture.detectChanges();
      http.expectOne('/api/roles').flush([]);
      http.expectOne((r) => r.url === '/api/candidates').flush([row]);
      await fixture.whenStable();
      const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>('select[aria-label="Stage for Ada"]')!;
      expect(select.value).toBe('Applied');
      select.value = 'Offer';
      select.dispatchEvent(new Event('change'));
      return { fixture, select, patch: http.expectOne('/api/candidates/7') };
    }

    it('saves the move, then refetches the list', async () => {
      const { fixture, select, patch } = await rendered();
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({ stage: 'Offer' });
      patch.flush({ ...row, stage: 'Offer' });
      fixture.detectChanges();

      http.expectOne((r) => r.url === '/api/candidates').flush([{ ...row, stage: 'Offer' }]);
      await fixture.whenStable();
      expect(select.value).toBe('Offer');
    });

    it('puts the dropdown back and shows why when the save fails', async () => {
      const { fixture, select, patch } = await rendered();
      patch.flush({ error: 'Nope' }, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      expect(select.value).toBe('Applied');
      expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Nope');
    });
  });
});
