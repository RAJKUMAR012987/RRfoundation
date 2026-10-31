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
import { DEFAULT_HOME_BELIEF, HomeBelief, SupabaseService } from '../../core/supabase.service';

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
  readonly homeVideoUrl = signal<string | null>(null);
  private loadingBelief = false;
  private loadingHomeVideo = false;
  private beliefChannel?: BroadcastChannel;

  async ngOnInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId) && typeof BroadcastChannel !== 'undefined') {
      this.beliefChannel = new BroadcastChannel('rrngo-home-belief');
      this.beliefChannel.addEventListener('message', this.onBeliefUpdated);
    }
    await Promise.all([this.refreshBelief(), this.refreshHomeVideo()]);
  }

  ngOnDestroy(): void {
    this.beliefChannel?.removeEventListener('message', this.onBeliefUpdated);
    this.beliefChannel?.close();
  }

  @HostListener('window:focus')
  async onWindowFocus(): Promise<void> {
    await Promise.all([this.refreshBelief(), this.refreshHomeVideo()]);
  }

  @HostListener('document:visibilitychange')
  async onVisibilityChange(): Promise<void> {
    if (isPlatformBrowser(this.platformId) && document.visibilityState === 'visible') {
      await Promise.all([this.refreshBelief(), this.refreshHomeVideo()]);
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

  private readonly onBeliefUpdated = (event: MessageEvent<HomeBelief>): void => {
    if (this.isHomeBelief(event.data)) {
      this.belief.set(event.data);
    }
  };

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
