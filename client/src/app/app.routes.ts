import { Routes } from '@angular/router';
import { CandidateDetail } from './candidate-detail/candidate-detail';
import { CandidateForm } from './candidate-form/candidate-form';
import { CandidateList } from './candidate-list/candidate-list';

export const routes: Routes = [
  { path: '', component: CandidateList, title: 'Candidates' },
  { path: 'candidates/new', component: CandidateForm, title: 'Add candidate' },
  { path: 'candidates/:id', component: CandidateDetail, title: 'Candidate' },
  { path: '**', redirectTo: '' },
];
