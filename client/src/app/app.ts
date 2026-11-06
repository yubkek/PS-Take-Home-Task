import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ConfirmDialog } from './confirm';

@Component({
  selector: 'app-root',
  imports: [ConfirmDialog, RouterLink, RouterOutlet],
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand">Candidate Tracker</a>
      <a routerLink="/candidates/new" class="button primary">Add candidate</a>
    </header>
    <main class="page"><router-outlet /></main>
    <app-confirm-dialog />
  `,
})
export class App {}
