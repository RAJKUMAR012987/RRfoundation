import {
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-contact',
  imports: [NgOptimizedImage, RouterLink, FormsModule],
  templateUrl: './contact.html',
  styleUrl: './contact.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Contact {
  /* ── Contact form ── */
  name = '';
  email = '';
  phone = '';
  subject = 'general';
  message = '';

  readonly formState = signal<'idle' | 'submitting' | 'success' | 'error'>('idle');

  submitContact(): void {
    if (!this.name.trim() || !this.email.trim() || !this.message.trim()) return;
    this.formState.set('submitting');
    // Replace with your real API call / EmailJS / Formspree endpoint
    setTimeout(() => this.formState.set('success'), 1200);
  }

  resetForm(): void {
    this.name = '';
    this.email = '';
    this.phone = '';
    this.subject = 'general';
    this.message = '';
    this.formState.set('idle');
  }

  /* ── Newsletter subscribe ── */
  subscribeEmail = '';
  readonly subState = signal<'idle' | 'submitting' | 'success' | 'error'>('idle');

  subscribe(): void {
    if (!this.subscribeEmail.trim()) return;
    this.subState.set('submitting');
    // Replace with your real newsletter API call (Mailchimp, etc.)
    setTimeout(() => this.subState.set('success'), 1000);
  }
}
