import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Donate } from './donate';

describe('Donate', () => {
  let component: Donate;
  let fixture: ComponentFixture<Donate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Donate],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Donate);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('validates optional donor email and phone details', () => {
    component.donorEmail = 'invalid-email';
    expect(component.isDonorDetailsValid).toBe(false);

    component.donorEmail = 'donor@example.com';
    component.donorPhone = '987654321';
    expect(component.isDonorDetailsValid).toBe(false);

    component.donorPhone = '9876543210';
    expect(component.isDonorDetailsValid).toBe(true);
  });

  it('keeps only the first ten digits in the phone field', () => {
    component.updateDonorPhone('+91 98765a43210');
    expect(component.donorPhone).toBe('9876543210');
  });

  it('should show online donations as coming soon without collecting payment details', () => {
    const page = fixture.nativeElement as HTMLElement;

    expect(page.textContent).toContain('Online donations are coming soon.');
    expect(page.querySelector('.payment-status')).toBeNull();
    expect(page.querySelector('input, form')).toBeNull();
  });

  it('should show the non-payment demo scan only on the donation page', () => {
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('.demo-payment')).not.toBeNull();
    expect(page.textContent).toContain('Not a payment QR and cannot be scanned.');

    const demoCode = page.querySelector('.demo-code-value')?.textContent;
    page.querySelector<HTMLButtonElement>('.demo-code-refresh')?.click();
    fixture.detectChanges();
    expect(page.querySelector('.demo-code-value')?.textContent).not.toBe(demoCode);
  });
});
