import { CurrencyPipe, DatePipe, isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DEFAULT_HOME_BELIEF,
  DonationPayment,
  HomeBelief,
  SiteContent,
  SiteContentKind,
  SupabaseService,
} from '../../core/supabase.service';

export function adminErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (typeof error === 'object' && error !== null) {
    const details = error as Record<string, unknown>;
    const message = stringValue(details['message']) ??
      stringValue(details['error_description']) ??
      stringValue(details['error']);
    if (message) {
      const code = stringValue(details['code']);
      const detail = stringValue(details['details']);
      return [message, code ? `Code: ${code}` : '', detail ?? '']
        .filter(Boolean)
        .join(' — ');
    }
  }
  return 'The request failed without an error message. Check the browser console and Supabase project logs.';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

@Component({
  selector: 'app-admin',
  imports: [CurrencyPipe, DatePipe, FormsModule, NgOptimizedImage, RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Admin implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = inject(SupabaseService);

  readonly configured = this.supabase.isConfigured;
  readonly authenticated = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly payments = signal<DonationPayment[]>([]);
  readonly content = signal<SiteContent[]>([]);
  readonly savingBelief = signal(false);
  homeBelief: HomeBelief = { ...DEFAULT_HOME_BELIEF };
  readonly contentKind = signal<SiteContentKind>('photo');
  readonly selectedFile = signal<File | null>(null);

  email = '';
  password = '';
  title = '';
  description = '';
  quote = '';

  get successfulTotal(): number {
    return this.payments()
      .filter((payment) => payment.status === 'captured')
      .reduce((total, payment) => total + payment.amount, 0);
  }

  get publishedCount(): number {
    return this.content().filter((item) => item.published).length;
  }

  get draftCount(): number {
    return this.content().filter((item) => !item.published).length;
  }

  async ngOnInit(): Promise<void> {
    if (!this.configured) {
      this.loading.set(false);
      return;
    }
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      if (await this.supabase.restoreAdminSession()) {
        this.authenticated.set(true);
        await this.loadDashboard();
      }
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async signIn(): Promise<void> {
    this.error.set('');
    this.notice.set('');
    this.loading.set(true);
    try {
      await this.supabase.signIn(this.email.trim(), this.password);
      this.authenticated.set(true);
      this.password = '';
      await this.loadDashboard();
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.error.set('');
    try {
      await this.supabase.signOut();
      this.authenticated.set(false);
      this.payments.set([]);
      this.content.set([]);
      this.homeBelief = { ...DEFAULT_HOME_BELIEF };
      this.notice.set('You have been signed out.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  async refresh(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.loadDashboard();
      this.notice.set('Dashboard refreshed.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  setKind(kind: SiteContentKind): void {
    this.contentKind.set(kind);
    this.selectedFile.set(null);
  }

  chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile.set(null);
    this.error.set('');
    if (!file) return;

    const allowedTypes =
      this.contentKind() === 'photo'
        ? ['image/jpeg', 'image/png', 'image/webp']
        : ['video/mp4', 'video/webm'];
    if (!allowedTypes.includes(file.type)) {
      this.error.set(
        this.contentKind() === 'photo'
          ? 'Choose a JPEG, PNG, or WebP image.'
          : 'Choose an MP4 or WebM video.',
      );
      input.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      this.error.set('The file is larger than the 50 MB upload limit.');
      input.value = '';
      return;
    }
    this.selectedFile.set(file);
  }

  async saveContent(): Promise<void> {
    this.error.set('');
    this.notice.set('');
    const kind = this.contentKind();
    const file = this.selectedFile();
    if (!this.title.trim()) {
      this.error.set('Enter a title for this item.');
      return;
    }
    if (kind === 'quote' && !this.quote.trim()) {
      this.error.set('Enter the quote text.');
      return;
    }
    if (kind !== 'quote' && !file) {
      this.error.set(`Choose a ${kind} file to upload.`);
      return;
    }

    this.saving.set(true);
    try {
      await this.supabase.addContent({
        kind,
        title: this.title,
        description: this.description,
        quote: this.quote,
        file: file ?? undefined,
      });
      this.title = '';
      this.description = '';
      this.quote = '';
      this.selectedFile.set(null);
      await this.loadDashboard();
      this.notice.set('Saved as a draft. Publish it when it is ready for the Projects page.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  async saveHomeBelief(): Promise<void> {
    this.error.set('');
    this.notice.set('');
    if (
      !this.homeBelief.eyebrow.trim() ||
      !this.homeBelief.heading.trim() ||
      !this.homeBelief.body.trim() ||
      !this.homeBelief.link_label.trim()
    ) {
      this.error.set('Complete all Home belief fields before saving.');
      return;
    }
    const linkUrl = this.homeBelief.link_url.trim();
    if (!linkUrl.startsWith('/') || linkUrl.startsWith('//') || linkUrl.includes('\\')) {
      this.error.set('The approach link must be a local site path, such as /about.');
      return;
    }

    this.savingBelief.set(true);
    try {
      const updated = { ...this.homeBelief, link_url: linkUrl };
      const savedBelief = await this.supabase.updateHomeBelief(updated);
      this.homeBelief = savedBelief;
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('rrngo-home-belief');
        channel.postMessage(savedBelief);
        channel.close();
      }
      this.notice.set('Home belief section updated and the saved content is now live.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.savingBelief.set(false);
    }
  }

  async togglePublished(item: SiteContent): Promise<void> {
    this.error.set('');
    try {
      await this.supabase.setContentPublished(item.id, !item.published);
      await this.loadDashboard();
      this.notice.set(item.published ? 'Item moved to drafts.' : 'Item published to the Projects page.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  async deleteItem(item: SiteContent): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    this.error.set('');
    try {
      await this.supabase.deleteContent(item);
      await this.loadDashboard();
      this.notice.set('Content deleted.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  private async loadDashboard(): Promise<void> {
    const [payments, content, homeBelief] = await Promise.all([
      this.supabase.getPayments(),
      this.supabase.getAllContent(),
      this.supabase.getHomeBelief(),
    ]);
    this.payments.set(payments);
    this.content.set(content);
    this.homeBelief = homeBelief;
  }

  private errorMessage(error: unknown): string {
    return adminErrorMessage(error);
  }
}
