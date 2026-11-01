import {
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  isValidEmailAddress,
  isValidIndianPhoneNumber,
  normalizeIndianPhoneDigits,
} from '../../core/form-validation';

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

  isValidEmailAddress(email: string): boolean {
    return isValidEmailAddress(email);
  }

  isValidIndianPhoneNumber(phone: string): boolean {
    return isValidIndianPhoneNumber(phone);
  }

  updatePhone(value: string): void {
    this.phone = normalizeIndianPhoneDigits(value);
  }

  get isContactFormValid(): boolean {
    return (
      Boolean(this.name.trim()) &&
      isValidEmailAddress(this.email) &&
      Boolean(this.message.trim()) &&
      (!this.phone || isValidIndianPhoneNumber(this.phone))
    );
  }

  get isSubscribeEmailValid(): boolean {
    return isValidEmailAddress(this.subscribeEmail);
  }

  submitContact(): void {
    if (!this.isContactFormValid) return;
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
    if (!this.isSubscribeEmailValid) return;
    this.subState.set('submitting');
    // Replace with your real newsletter API call (Mailchimp, etc.)
    setTimeout(() => this.subState.set('success'), 1000);
  }
}
