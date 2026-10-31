import {
  CurrencyPipe,
  DatePipe,
  DecimalPipe,
  isPlatformBrowser,
  NgOptimizedImage,
} from '@angular/common';
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
  DEFAULT_HOME_FOUNDERS,
  BucketVideo,
  DonationPayment,
  HomeBelief,
  HomeFounders,
  SiteContent,
  SiteContentKind,
  SupabaseService,
} from '../../core/supabase.service';

export function adminErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (typeof error === 'object' && error !== null) {
    const details = error as Record<string, unknown>;
    if (
      details['code'] === 'PGRST205' &&
      typeof details['message'] === 'string' &&
      details['message'].includes('home_founders')
    ) {
      return 'The Home founder table is missing in Supabase. Run supabase/migrations/202611010003_home_founder_section.sql in the Supabase SQL Editor, then refresh this dashboard.';
    }
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
  imports: [CurrencyPipe, DatePipe, DecimalPipe, FormsModule, NgOptimizedImage, RouterLink],
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
  readonly availableBucketVideos = signal<BucketVideo[]>([]);
  readonly importingBucketVideo = signal('');
  readonly savingBelief = signal(false);
  readonly savingFeaturedVideo = signal(false);
  readonly savingFounders = signal(false);
  readonly preparingFounderPhotos = signal(false);
  readonly founderFiles = signal<File[]>([]);
  readonly removeFounderPhotos = signal(false);
  homeBelief: HomeBelief = { ...DEFAULT_HOME_BELIEF };
  homeFounders: HomeFounders = { ...DEFAULT_HOME_FOUNDERS };
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
      this.availableBucketVideos.set([]);
      this.homeBelief = { ...DEFAULT_HOME_BELIEF };
      this.homeFounders = { ...DEFAULT_HOME_FOUNDERS };
      this.founderFiles.set([]);
      this.removeFounderPhotos.set(false);
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

  async importBucketVideo(video: BucketVideo, featureOnHome = false): Promise<void> {
    this.error.set('');
    this.notice.set('');
    this.importingBucketVideo.set(video.path);
    try {
      const title = video.name.replace(/\.(mp4|webm)$/i, '').replace(/[-_]+/g, ' ').trim();
      const contentId = await this.supabase.importBucketVideo(video.path, title || video.name);
      const videoUrl = featureOnHome
        ? await this.supabase.setHomeFeaturedVideo(contentId)
        : undefined;
      await this.loadDashboard();
      if (featureOnHome) {
        await this.broadcastHomeVideo(videoUrl);
      }
      this.notice.set(
        featureOnHome
          ? `"${video.name}" was added to Projects and featured in the Home hero.`
          : `"${video.name}" was added to Projects. Choose Feature on Home to use it in the hero.`,
      );
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.importingBucketVideo.set('');
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

  async chooseFounderPhotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.founderFiles.set([]);
    this.error.set('');
    const existingPhotoCount = this.removeFounderPhotos() ? 0 : this.homeFounders.photos.length;
    if (files.length + existingPhotoCount > 4) {
      this.error.set(`You can add only ${4 - existingPhotoCount} more founder photo(s).`);
      input.value = '';
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (files.some((file) => !allowedTypes.includes(file.type))) {
      this.error.set('Founder photos must be JPEG, PNG, or WebP images.');
      input.value = '';
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      this.error.set('Each founder photo must be 10 MB or smaller.');
      input.value = '';
      return;
    }

    this.preparingFounderPhotos.set(true);
    try {
      const preparedFiles = await Promise.all(files.map((file) => this.prepareFounderPhoto(file)));
      this.founderFiles.set(preparedFiles);
    } catch (error) {
      this.error.set(this.errorMessage(error));
      input.value = '';
    } finally {
      this.preparingFounderPhotos.set(false);
    }
  }

  private async prepareFounderPhoto(file: File): Promise<File> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error(`Could not read "${file.name}". Choose a valid image file.`);
    }

    try {
      const scale = Math.min(1, 1600 / bitmap.width, 1200 / bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare this founder photo.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) =>
            result
              ? resolve(result)
              : reject(new Error(`Could not optimize "${file.name}". Try another image.`)),
          'image/jpeg',
          0.88,
        );
      });
      const filename = file.name.replace(/\.[^.]+$/, '') || 'founder-photo';
      return new File([blob], `${filename}.jpg`, {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      });
    } finally {
      bitmap.close();
    }
  }

  toggleRemoveFounderPhotos(event: Event): void {
    this.removeFounderPhotos.set((event.target as HTMLInputElement).checked);
  }

  async saveHomeFounders(): Promise<void> {
    this.error.set('');
    this.notice.set('');
    if (!this.homeFounders.message.trim() || !this.homeFounders.name.trim()) {
      this.error.set('Enter the founder message and founder name before saving.');
      return;
    }

    this.savingFounders.set(true);
    try {
      const saved = await this.supabase.updateHomeFounders({
        message: this.homeFounders.message,
        name: this.homeFounders.name,
        files: this.founderFiles(),
        removePhotos: this.removeFounderPhotos(),
      });
      this.homeFounders = saved;
      this.founderFiles.set([]);
      this.removeFounderPhotos.set(false);
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('rrngo-home-founders');
        channel.postMessage(saved);
        channel.close();
      }
      this.notice.set('Founder message and photos are now live on the Home page.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.savingFounders.set(false);
    }
  }

  async togglePublished(item: SiteContent): Promise<void> {
    this.error.set('');
    try {
      await this.supabase.setContentPublished(item.id, !item.published);
      await this.loadDashboard();
      await this.broadcastHomeVideo();
      this.notice.set(item.published ? 'Item moved to drafts.' : 'Item published to the Projects page.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  async setHomeFeaturedVideo(item: SiteContent | null): Promise<void> {
    this.error.set('');
    this.notice.set('');
    this.savingFeaturedVideo.set(true);
    try {
      const videoUrl = await this.supabase.setHomeFeaturedVideo(item?.id ?? null);
      await this.loadDashboard();
      this.broadcastHomeVideo(videoUrl);
      this.notice.set(
        item
          ? `"${item.title}" is now the featured Home video.`
          : 'The featured Home video was removed. The default image is shown.',
      );
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.savingFeaturedVideo.set(false);
    }
  }

  async deleteItem(item: SiteContent): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    this.error.set('');
    try {
      await this.supabase.deleteContent(item);
      await this.loadDashboard();
      if (item.home_featured) await this.broadcastHomeVideo(null);
      this.notice.set('Content deleted.');
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  private async loadDashboard(): Promise<void> {
    const [payments, content, homeBelief, homeFounders, availableBucketVideos] = await Promise.all([
      this.supabase.getPayments(),
      this.supabase.getAllContent(),
      this.supabase.getHomeBelief(),
      this.supabase.getHomeFounders(),
      this.supabase.getAvailableBucketVideos(),
    ]);
    this.payments.set(payments);
    this.content.set(content);
    this.homeBelief = homeBelief;
    this.homeFounders = homeFounders;
    this.availableBucketVideos.set(availableBucketVideos);
  }

  private async broadcastHomeVideo(videoUrl?: string | null): Promise<void> {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('rrngo-home-video');
    channel.postMessage({
      videoUrl: videoUrl === undefined ? await this.supabase.getHomeVideoUrl() : videoUrl,
    });
    channel.close();
  }

  private errorMessage(error: unknown): string {
    return adminErrorMessage(error);
  }
}
