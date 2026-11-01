import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import {
  isValidEmailAddress,
  isValidIndianPhoneNumber,
  normalizeIndianPhoneDigits,
} from '../../core/form-validation';

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  image?: string;
  order_id?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOrderResponse {
  orderId: string;
  keyId?: string;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => { open(): void };
  }
}

export interface DonationCategory {
  id: string;
  icon: string;
  label: string;
  description: string;
  color: string;
}

export const DONATION_CATEGORIES: DonationCategory[] = [
  {
    id: 'education',
    icon: '📚',
    label: 'Education',
    description: 'Fund classrooms, books & scholarships',
    color: '#1c6b45',
  },
  {
    id: 'health',
    icon: '🏥',
    label: 'Healthcare',
    description: 'Medical camps & community health',
    color: '#1e4d8c',
  },
  {
    id: 'women',
    icon: '👩‍💼',
    label: 'Women Empowerment',
    description: 'Skills training & livelihood support',
    color: '#7a2d6e',
  },
  {
    id: 'hunger',
    icon: '🍱',
    label: 'Child Hunger',
    description: 'Meals, nutrition & food security for children',
    color: '#b84c00',
  },
];

const PRESET_AMOUNTS = [500, 1000, 2500, 5000, 10000] as const;

@Component({
  selector: 'app-donate',
  imports: [NgOptimizedImage, RouterLink, FormsModule],
  templateUrl: './donate.html',
  styleUrl: './donate.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Donate implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);

  private readonly ORG_NAME = 'RRNGO – RR Trust & Foundation';

  private readonly SUPABASE_FUNCTIONS_URL =
  'https://ttgjdrsakuosjrpqhhqo.supabase.co/functions/v1';

  readonly categories = DONATION_CATEGORIES;
  readonly presetAmounts = PRESET_AMOUNTS;

  readonly selectedCategory = signal<DonationCategory>(DONATION_CATEGORIES[0]);
  readonly selectedPreset = signal<number | null>(1000);
  readonly paymentState = signal<'idle' | 'processing' | 'success' | 'error'>('idle');
  readonly paymentError = signal<string>('');
  readonly lastPaymentId = signal<string>('');

  customAmountInput = '';
  donorName = '';
  donorEmail = '';
  donorPhone = '';
  isAnonymous = false;

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadRazorpayScript();
    }
  }

  get effectiveAmount(): number {
    if (this.selectedPreset() !== null) return this.selectedPreset()!;
    const parsed = parseFloat(this.customAmountInput);
    return isNaN(parsed) ? 0 : Math.floor(parsed);
  }

  get isAmountValid(): boolean {
    return this.effectiveAmount >= 10;
  }

  get isDonorDetailsValid(): boolean {
    return (
      (!this.donorPhone || isValidIndianPhoneNumber(this.donorPhone)) &&
      (!this.donorEmail || isValidEmailAddress(this.donorEmail))
    );
  }

  isValidEmailAddress(email: string): boolean {
    return isValidEmailAddress(email);
  }

  isValidIndianPhoneNumber(phone: string): boolean {
    return isValidIndianPhoneNumber(phone);
  }

  updateDonorPhone(value: string): void {
    this.donorPhone = normalizeIndianPhoneDigits(value);
  }

  selectCategory(cat: DonationCategory): void {
    this.selectedCategory.set(cat);
  }

  selectPreset(amount: number): void {
    this.selectedPreset.set(amount);
    this.customAmountInput = '';
  }

  onCustomAmountFocus(): void {
    this.selectedPreset.set(null);
  }

  async pay(): Promise<void> {
    if (!this.isAmountValid || (!this.isAnonymous && !this.isDonorDetailsValid)) {
      if (!this.isAnonymous && !this.isDonorDetailsValid) {
        this.paymentState.set('error');
        this.paymentError.set(
          this.donorPhone && !isValidIndianPhoneNumber(this.donorPhone)
            ? 'Enter exactly 10 phone digits after +91.'
            : 'Enter a valid email address.',
        );
      }
      return;
    }
    this.paymentState.set('processing');
    this.paymentError.set('');
    try {
      await this.openRazorpay(this.effectiveAmount);
    } catch (err) {
      this.paymentState.set('error');
      this.paymentError.set(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    }
  }

  private async openRazorpay(amountInr: number): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('Payment is not available server-side.');
    }
    if (!window.Razorpay) {
      throw new Error('Razorpay SDK failed to load. Check your internet connection and try again.');
    }
    if (!environment.razorpayKeyId || environment.razorpayKeyId === 'YOUR_RAZORPAY_KEY_ID') {
      throw new Error('Set your Razorpay Key ID in src/environments/environment.ts before accepting payments.');
    }

    const orderResponse = await fetch(
      `${this.SUPABASE_FUNCTIONS_URL}/create-payment-order`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabaseKey,
        },
        body: JSON.stringify({
          amount: amountInr,
          category: this.selectedCategory().id,
        }),
      },
    );
    const orderData = (await orderResponse.json()) as Partial<RazorpayOrderResponse> & {
      error?: string;
    };
    if (!orderResponse.ok) {
      throw new Error(orderData.error || 'Unable to start a secure payment. Please try again.');
    }
    if (!orderData.orderId) {
      throw new Error('Razorpay did not return an order ID. Please try again.');
    }
    if (orderData.keyId !== environment.razorpayKeyId) {
      throw new Error(
        'Razorpay test Key ID mismatch. Make sure environment.ts razorpayKeyId matches RAZORPAY_KEY_ID in the server .env file, then restart the server and reload this page.',
      );
    }

    return new Promise((resolve, reject) => {
      const cat = this.selectedCategory();
      let verificationStarted = false;
      const options: RazorpayOptions = {
        key: environment.razorpayKeyId,
        amount: amountInr * 100,
        currency: 'INR',
        name: this.ORG_NAME,
        description: `Donation – ${cat.label}`,
        order_id: orderData.orderId,
        prefill: {
          name: this.isAnonymous ? undefined : this.donorName || undefined,
          email: this.isAnonymous ? undefined : this.donorEmail || undefined,
          contact: this.isAnonymous
            ? undefined
            : this.donorPhone
              ? `+91${this.donorPhone}`
              : undefined,
        },
        notes: { category: cat.id },
        theme: { color: cat.color },
        handler: (response: RazorpaySuccessResponse) => {
          if (verificationStarted) return;
          verificationStarted = true;
          void fetch(`${this.SUPABASE_FUNCTIONS_URL}/verify-payment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: environment.supabaseKey,
            },
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              donorEmail: this.isAnonymous ? null : this.donorEmail || null,
            }),
          })
            .then(async (verificationResponse) => {
              const verificationData = (await verificationResponse.json()) as {
                verified?: boolean;
                error?: string;
              };
              if (!verificationResponse.ok || verificationData.verified !== true) {
                throw new Error(
                  verificationData.error || 'The payment could not be verified. Please contact us.',
                );
              }
              this.lastPaymentId.set(response.razorpay_payment_id);
              this.paymentState.set('success');
              resolve();
            })
            .catch(reject);
        },
        modal: {
          ondismiss: () => {
            if (verificationStarted) return;
            this.paymentState.set('idle');
            resolve();
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    });
  }

  private loadRazorpayScript(): void {
    if (document.getElementById('razorpay-sdk')) return;
    const script = document.createElement('script');
    script.id = 'razorpay-sdk';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.head.appendChild(script);
  }
}
