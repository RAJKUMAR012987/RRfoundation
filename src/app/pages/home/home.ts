import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  DEFAULT_HOME_BELIEF,
  DEFAULT_HOME_FOUNDERS,
  HomeBelief,
  HomeFounders,
  SupabaseService,
} from '../../core/supabase.service';

@Component({
  selector: 'app-home',
  imports: [NgOptimizedImage, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = inject(SupabaseService);

  readonly belief = signal<HomeBelief>(DEFAULT_HOME_BELIEF);
  readonly founders = signal<HomeFounders>(DEFAULT_HOME_FOUNDERS);
  readonly homeVideoUrl = signal<string | null>(null);
  private loadingBelief = false;
  private loadingFounders = false;
  private loadingHomeVideo = false;
  private beliefChannel?: BroadcastChannel;
  private foundersChannel?: BroadcastChannel;
  private videoChannel?: BroadcastChannel;

  async ngOnInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId) && typeof BroadcastChannel !== 'undefined') {
      this.beliefChannel = new BroadcastChannel('rrngo-home-belief');
      this.beliefChannel.addEventListener('message', this.onBeliefUpdated);
      this.foundersChannel = new BroadcastChannel('rrngo-home-founders');
      this.foundersChannel.addEventListener('message', this.onFoundersUpdated);
      this.videoChannel = new BroadcastChannel('rrngo-home-video');
      this.videoChannel.addEventListener('message', this.onHomeVideoUpdated);
    }
    await Promise.all([this.refreshBelief(), this.refreshFounders(), this.refreshHomeVideo()]);
  }

  ngOnDestroy(): void {
    this.beliefChannel?.removeEventListener('message', this.onBeliefUpdated);
    this.beliefChannel?.close();
    this.foundersChannel?.removeEventListener('message', this.onFoundersUpdated);
    this.foundersChannel?.close();
    this.videoChannel?.removeEventListener('message', this.onHomeVideoUpdated);
    this.videoChannel?.close();
  }

  @HostListener('window:focus')
  async onWindowFocus(): Promise<void> {
    await Promise.all([this.refreshBelief(), this.refreshFounders(), this.refreshHomeVideo()]);
  }

  @HostListener('document:visibilitychange')
  async onVisibilityChange(): Promise<void> {
    if (isPlatformBrowser(this.platformId) && document.visibilityState === 'visible') {
      await Promise.all([this.refreshBelief(), this.refreshFounders(), this.refreshHomeVideo()]);
    }
  }

  private async refreshBelief(): Promise<void> {
    if (
      !isPlatformBrowser(this.platformId) ||
      !this.supabase.isConfigured ||
      this.loadingBelief
    ) {
      return;
    }

    this.loadingBelief = true;
    try {
      this.belief.set(await this.supabase.getHomeBelief());
    } catch (error) {
      console.error('Unable to load the Home belief content from Supabase.', error);
    } finally {
      this.loadingBelief = false;
    }
  }

  private async refreshHomeVideo(): Promise<void> {
    if (
      !isPlatformBrowser(this.platformId) ||
      !this.supabase.isConfigured ||
      this.loadingHomeVideo
    ) {
      return;
    }

    this.loadingHomeVideo = true;
    try {
      this.homeVideoUrl.set(await this.supabase.getHomeVideoUrl());
    } catch (error) {
      console.error('Unable to load the published Home video from Supabase.', error);
    } finally {
      this.loadingHomeVideo = false;
    }
  }

  private async refreshFounders(): Promise<void> {
    if (
      !isPlatformBrowser(this.platformId) ||
      !this.supabase.isConfigured ||
      this.loadingFounders
    ) {
      return;
    }

    this.loadingFounders = true;
    try {
      this.founders.set(await this.supabase.getHomeFounders());
    } catch (error) {
      if (this.isMissingHomeFoundersTable(error)) {
        console.warn(
          'The Home founder section is not set up in Supabase. Run supabase/migrations/202611010003_home_founder_section.sql to enable it.',
        );
      } else {
        console.error('Unable to load the Home founder section from Supabase.', error);
      }
    } finally {
      this.loadingFounders = false;
    }
  }

  private isMissingHomeFoundersTable(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const details = error as Record<string, unknown>;
    return (
      details['code'] === 'PGRST205' &&
      typeof details['message'] === 'string' &&
      details['message'].includes('home_founders')
    );
  }

  private readonly onBeliefUpdated = (event: MessageEvent<HomeBelief>): void => {
    if (this.isHomeBelief(event.data)) {
      this.belief.set(event.data);
    }
  };

  private readonly onHomeVideoUpdated = (
    event: MessageEvent<{ videoUrl: string | null }>,
  ): void => {
    const videoUrl = event.data?.videoUrl;
    if (videoUrl === null || typeof videoUrl === 'string') {
      this.homeVideoUrl.set(videoUrl);
    }
  };

  private readonly onFoundersUpdated = (event: MessageEvent<HomeFounders>): void => {
    if (this.isHomeFounders(event.data)) {
      this.founders.set(event.data);
    }
  };

  private isHomeFounders(value: unknown): value is HomeFounders {
    if (typeof value !== 'object' || value === null) return false;
    const founders = value as Record<string, unknown>;
    return (
      typeof founders['message'] === 'string' &&
      typeof founders['name'] === 'string' &&
      Array.isArray(founders['photos']) &&
      founders['photos'].every(
        (photo) =>
          typeof photo === 'object' &&
          photo !== null &&
          typeof (photo as Record<string, unknown>)['path'] === 'string' &&
          typeof (photo as Record<string, unknown>)['url'] === 'string',
      )
    );
  }

  private isHomeBelief(value: unknown): value is HomeBelief {
    if (typeof value !== 'object' || value === null) return false;
    return (
      'eyebrow' in value &&
      typeof value.eyebrow === 'string' &&
      'heading' in value &&
      typeof value.heading === 'string' &&
      'body' in value &&
      typeof value.body === 'string' &&
      'link_label' in value &&
      typeof value.link_label === 'string' &&
      'link_url' in value &&
      typeof value.link_url === 'string'
    );
  }
}
