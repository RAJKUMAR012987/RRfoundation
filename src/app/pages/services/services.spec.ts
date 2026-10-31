import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Services } from './services';

describe('Services', () => {
  let component: Services;
  let fixture: ComponentFixture<Services>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Services],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Services);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the work hero and four programme cards', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('#services-title')?.textContent).toContain('Care that starts');
    expect(element.querySelectorAll('.sw-prog-card')).toHaveLength(4);
    expect(element.querySelector('.sw-hero__bg img')?.getAttribute('src')).toContain('images.unsplash.com');
  });
});
