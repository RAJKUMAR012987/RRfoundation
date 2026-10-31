import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () => import('./pages/home/home').then((module) => module.Home),
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about').then((module) => module.About),
  },
  {
    path: 'services',
    loadComponent: () => import('./pages/services/services').then((module) => module.Services),
  },
  {
    path: 'gallery',
    loadComponent: () => import('./pages/gallery/gallery').then((module) => module.Gallery),
  },
  {
    path: 'contact',
    loadComponent: () => import('./pages/contact/contact').then((module) => module.Contact),
  },
  {
    path: 'donate',
    loadComponent: () => import('./pages/donate/donate').then((module) => module.Donate),
  },
  {
    path: 'admin',
    loadComponent: () => import('./pages/admin/admin').then((module) => module.Admin),
  },
];
