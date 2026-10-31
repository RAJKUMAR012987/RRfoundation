import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('should render the navigation and load every page route', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('#main-navigation a')).toHaveLength(5);
    expect(compiled.querySelector('.site-header .header-brand .brand-logo')).not.toBeNull();
    const utilityBar = compiled.querySelector<HTMLElement>('.utility-bar');
    expect(utilityBar?.textContent).toContain('hello@example.org');
    expect(utilityBar?.textContent).toContain('+91 00000 00000');
    expect(compiled.querySelector('.header-pan')?.textContent).toContain('PAN-ABCD-1234');
    expect(compiled.querySelector('.header-reg-number')?.textContent).toContain('REG-ABCD-1234');
    expect(compiled.querySelector('.sf-col--brand .sf-reg-details')).toBeNull();
    expect(utilityBar?.querySelector('a[href*="facebook.com"]')).not.toBeNull();
    expect(utilityBar?.querySelector('a[href*="instagram.com"]')).not.toBeNull();
    expect(utilityBar?.textContent).toContain('Volunteer');
    expect(utilityBar?.textContent).toContain('Sample contact details and social links');
    expect(compiled.querySelector('.site-header .header-cta')?.textContent).toContain('Donate now');
    expect(compiled.querySelector('.site-header .header-cta')?.getAttribute('href')).toBe('/donate');
    expect(compiled.querySelector('.legal-strip')).toBeNull();

    for (const [path, title] of [
      ['home', 'Change grows'],
      ['about', 'Progress belongs'],
      ['services', 'Care that starts'],
      ['gallery', 'A shared effort'],
      ['contact', 'Good things begin'],
      ['donate', 'Every act of support'],
    ]) {
      await router.navigateByUrl(`/${path}`);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(compiled.querySelector('main h1')?.textContent).toContain(title);
    }
  }, 15000);

  it('should toggle the responsive navigation menu', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const menuButton = compiled.querySelector<HTMLButtonElement>('.menu-toggle');
    const navigation = compiled.querySelector<HTMLElement>('#main-navigation');

    expect(menuButton).not.toBeNull();
    expect(navigation).not.toBeNull();
    expect(menuButton?.getAttribute('aria-expanded')).toBe('false');

    menuButton?.click();
    fixture.detectChanges();
    expect(menuButton?.getAttribute('aria-expanded')).toBe('true');
    expect(navigation?.classList.contains('is-open')).toBe(true);

    menuButton?.click();
    fixture.detectChanges();
    expect(menuButton?.getAttribute('aria-expanded')).toBe('false');
    expect(navigation?.classList.contains('is-open')).toBe(false);
  });

  it('should show donation details 10 seconds after entering the home page', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
    await router.navigateByUrl('/home');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[role="dialog"]')).toBeNull();

    await vi.advanceTimersByTimeAsync(9_999);
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();

    const dialog = compiled.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('donation-dialog-title');
    expect(dialog?.textContent).toContain('Together, we can build a brighter tomorrow.');
    expect(dialog?.querySelector('.donation-dialog-image img')).not.toBeNull();
    expect(dialog?.querySelector('a[routerLink="/donate"]')?.textContent).toContain('Donate now');
    expect(dialog?.querySelector('.demo-payment')).toBeNull();

    dialog?.querySelector<HTMLButtonElement>('.dialog-close')?.click();
    fixture.detectChanges();
    expect(compiled.querySelector('[role="dialog"]')).toBeNull();
    vi.useRealTimers();
  });

  it('should not show donation details outside the home page', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await fixture.whenStable();
    await router.navigateByUrl('/admin');

    await vi.advanceTimersByTimeAsync(10_000);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')).toBeNull();
    vi.useRealTimers();
  });
});
