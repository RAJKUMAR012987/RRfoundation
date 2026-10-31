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

  it('limits added founder photos to four total', () => {
    const component = fixture.componentInstance;
    component.homeFounders = {
      message: 'A founder message',
      name: 'Founder',
      photos: [
        { path: 'one.jpg', url: '/one.jpg' },
        { path: 'two.jpg', url: '/two.jpg' },
        { path: 'three.jpg', url: '/three.jpg' },
      ],
    };
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: [
        new File(['image'], 'fourth.jpg', { type: 'image/jpeg' }),
        new File(['image'], 'fifth.jpg', { type: 'image/jpeg' }),
      ],
    });

    component.chooseFounderPhotos({ target: input } as unknown as Event);

    expect(component.founderFiles()).toHaveLength(0);
    expect(component.error()).toContain('add only 1 more');
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

  it('explains how to apply the missing Home founder migration', () => {
    expect(
      adminErrorMessage({
        code: 'PGRST205',
        message: "Could not find the table 'public.home_founders' in the schema cache",
      }),
    ).toContain('202611010003_home_founder_section.sql');
  });
});
