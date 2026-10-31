import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Gallery } from './gallery';

describe('Gallery', () => {
  let component: Gallery;
  let fixture: ComponentFixture<Gallery>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Gallery],
      providers: [provideRouter([])],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Gallery);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the projects page with four project cards', () => {
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('#projects-title')?.textContent).toContain('Projects shaped');
    expect(element.querySelectorAll('.project-card')).toHaveLength(4);
  });
});
