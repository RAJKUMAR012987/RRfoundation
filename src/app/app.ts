import { NgOptimizedImage } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component,
  NgZone,
  OnDestroy,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnDestroy {
  readonly menuOpen = signal(false);
  readonly donationDetailsOpen = signal(false);
  private popupTimer?: ReturnType<typeof setTimeout>;
  private readonly routeSubscription: Subscription;

  constructor(
    private readonly ngZone: NgZone,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly router: Router,
  ) {
    this.routeSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.updateDonationPopup(event.urlAfterRedirects));

    afterNextRender(() => {
      this.updateDonationPopup(this.router.url);
    });
  }

  ngOnDestroy(): void {
    this.clearPopupTimer();
    this.routeSubscription.unsubscribe();
  }

  toggleNavigation(): void {
    this.menuOpen.update((isOpen) => !isOpen);
  }

  closeNavigation(): void {
    this.menuOpen.set(false);
  }

  openDonationDetails(): void {
    this.donationDetailsOpen.set(true);
  }

  closeDonationDetails(): void {
    this.donationDetailsOpen.set(false);
  }

  private updateDonationPopup(url: string): void {
    this.clearPopupTimer();
    if (!this.isHomePageUrl(url)) {
      this.donationDetailsOpen.set(false);
      return;
    }

    this.popupTimer = setTimeout(
      () =>
        this.ngZone.run(() => {
          if (this.isHomePageUrl(this.router.url)) {
            this.openDonationDetails();
            this.changeDetector.detectChanges();
          }
        }),
      10_000,
    );
  }

  private isHomePageUrl(url: string): boolean {
    const path = url.split(/[?#]/, 1)[0];
    return path === '/' || path === '/home';
  }

  private clearPopupTimer(): void {
    if (this.popupTimer !== undefined) {
      clearTimeout(this.popupTimer);
      this.popupTimer = undefined;
    }
  }
}
