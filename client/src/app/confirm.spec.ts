import { TestBed } from '@angular/core/testing';
import { ConfirmDialog, ConfirmService } from './confirm';

describe('ConfirmDialog', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  async function render() {
    const fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();
    const confirm = TestBed.inject(ConfirmService);
    const answer = confirm.ask('Delete Ada?', 'Delete');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, answer, dialog: el.querySelector('dialog')!, confirm };
  }

  it('shows the question and resolves true on the action button', async () => {
    const { fixture, el, answer, dialog } = await render();
    expect(dialog.open).toBe(true);
    expect(el.textContent).toContain('Delete Ada?');
    el.querySelector<HTMLButtonElement>('.confirm-action')!.click();
    expect(await answer).toBe(true);
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
  });

  it('resolves false on Cancel', async () => {
    const { el, answer } = await render();
    el.querySelector('button')!.click();
    expect(await answer).toBe(false);
  });

  it('treats closing the dialog, as Escape does, as a no', async () => {
    const { answer, dialog } = await render();
    dialog.dispatchEvent(new Event('close'));
    expect(await answer).toBe(false);
  });

  it('puts Cancel first, so it takes the initial focus', async () => {
    const { el } = await render();
    expect(el.querySelector('button')!.textContent).toContain('Cancel');
  });
});
