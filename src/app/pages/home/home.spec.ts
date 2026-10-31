import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Home } from './home';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the Admin-managed founder message and up to four photos above Our belief', () => {
    component.founders.set({
      message: 'We listen and grow together.',
      name: 'A. Founder',
      photos: [
        { path: 'founder-1.jpg', url: '/founder-1.jpg' },
        { path: 'founder-2.jpg', url: '/founder-2.jpg' },
        { path: 'founder-3.jpg', url: '/founder-3.jpg' },
        { path: 'founder-4.jpg', url: '/founder-4.jpg' },
      ],
    });
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    const founderSection = page.querySelector('.hh-founder');
    const beliefSection = page.querySelector('.hh-mission');
    expect(founderSection).not.toBeNull();
    expect(beliefSection).not.toBeNull();
    expect(founderSection?.textContent).toContain('We listen and grow together.');
    expect(founderSection?.textContent).toContain('A. Founder');
    expect(founderSection?.querySelectorAll('.hh-founder__photos img')).toHaveLength(4);
    if (founderSection && beliefSection) {
      expect(
        founderSection.compareDocumentPosition(beliefSection) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });
});
