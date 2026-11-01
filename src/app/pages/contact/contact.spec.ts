import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Contact } from './contact';

describe('Contact', () => {
  let component: Contact;
  let fixture: ComponentFixture<Contact>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Contact],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Contact);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requires a valid email and validates an optional Indian phone number', () => {
    component.name = 'Ravi Kumar';
    component.email = 'not-an-email';
    component.message = 'Hello';
    expect(component.isContactFormValid).toBe(false);

    component.email = 'ravi@example.com';
    component.phone = '987654321';
    expect(component.isContactFormValid).toBe(false);

    component.phone = '9876543210';
    expect(component.isContactFormValid).toBe(true);
  });

  it('keeps only the first ten digits in the phone field', () => {
    component.updatePhone('+91 98765a43210');
    expect(component.phone).toBe('9876543210');
  });
});
