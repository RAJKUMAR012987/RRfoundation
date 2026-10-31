import { ChangeDetectionStrategy, Component } from '@angular/core';
import { isPlatformBrowser, NgOptimizedImage } from '@angular/common';
import { inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SiteContent, SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-gallery',
  imports: [NgOptimizedImage, RouterLink],
  templateUrl: './gallery.html',
  styleUrl: './gallery.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Gallery implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = inject(SupabaseService);

  readonly contentConfigured = this.supabase.isConfigured;
  readonly communityContent = signal<SiteContent[]>([]);
  readonly communityContentLoading = signal(false);
  readonly communityContentError = signal('');

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId) && this.contentConfigured) {
      void this.loadCommunityContent();
    } else {
      this.communityContentLoading.set(false);
    }
  }

  private async loadCommunityContent(): Promise<void> {
    this.communityContentLoading.set(true);
    try {
      this.communityContent.set(await this.supabase.getPublishedContent());
    } catch (error) {
      this.communityContentError.set(
        error instanceof Error ? error.message : 'Community updates could not be loaded.',
      );
    } finally {
      this.communityContentLoading.set(false);
    }
  }
}
