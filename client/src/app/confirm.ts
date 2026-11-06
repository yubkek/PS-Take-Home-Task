import { Component, effect, ElementRef, inject, Injectable, signal, viewChild } from '@angular/core';

// In-page because some embedded browsers auto-cancel window.confirm.
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<{ message: string; action: string; resolve: (yes: boolean) => void } | null>(null);

  ask(message: string, action: string) {
    return new Promise<boolean>((resolve) => this.request.set({ message, action, resolve }));
  }

  answer(yes: boolean) {
    this.request()?.resolve(yes);
    this.request.set(null);
  }
}

// Native dialog: traps focus, closes on Escape, and focuses Cancel first.
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <dialog #dialog class="confirm" aria-labelledby="confirm-message" (close)="confirm.answer(false)">
      <p id="confirm-message">{{ confirm.request()?.message }}</p>
      <div class="actions">
        <button type="button" (click)="confirm.answer(false)">Cancel</button>
        <button type="button" class="confirm-action" (click)="confirm.answer(true)">
          {{ confirm.request()?.action }}
        </button>
      </div>
    </dialog>
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.confirm.request() && !dialog.open) dialog.showModal();
      if (!this.confirm.request() && dialog.open) dialog.close();
    });
  }
}
