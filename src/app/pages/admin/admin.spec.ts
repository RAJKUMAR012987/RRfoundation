import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SupabaseService } from '../../core/supabase.service';
import { adminErrorMessage, Admin } from './admin';

describe('Admin', () => {
  let fixture: ComponentFixture<Admin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Admin],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: { isConfigured: false } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Admin);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('explains setup when Supabase has not been configured', () => {
    expect(fixture.nativeElement.textContent).toContain('Admin dashboard setup required');
  });
});

describe('Admin dashboard error reporting', () => {
  it('extracts Supabase/PostgREST messages and diagnostic codes', () => {
    expect(
      adminErrorMessage({
        message: 'relation "donation_payments" does not exist',
        code: '42P01',
      }),
    ).toBe('relation "donation_payments" does not exist — Code: 42P01');
  });

  it('provides guidance when a failed request has no message', () => {
    expect(adminErrorMessage({})).toContain('Supabase project logs');
  });
});
