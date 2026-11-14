// SideNav on a phone is one horizontal row of sections: the current section is scrolled into view
// (centred), and nothing moves when the row fits.
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SideNav, type NavItem } from '../src';

const ITEM_WIDTH = 100;
const items = (active: string): NavItem[] =>
  Array.from({ length: 14 }, (_, i) => ({
    id: `s${i}`,
    label: `Раздел ${i}`,
    href: `/admin/s${i}`,
    active: `s${i}` === active,
  }));

/** jsdom has no layout: give the row and its links the sizes of a 390 px phone. */
function fakeLayout(rowWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.tagName === 'UL' ? rowWidth : ITEM_WIDTH;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.tagName === 'UL' ? this.querySelectorAll('a').length * ITEM_WIDTH : ITEM_WIDTH;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(ITEM_WIDTH);
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    const links = [...(this.closest('ul')?.querySelectorAll('a') ?? [])];
    return Math.max(0, links.indexOf(this as HTMLAnchorElement)) * ITEM_WIDTH;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const row = (container: HTMLElement) => container.querySelector('ul') as HTMLUListElement;

describe('SideNav', () => {
  it('scrolls the row so the current section is centred', () => {
    fakeLayout(390);
    const { container, rerender } = render(<SideNav label="Разделы" items={items('s9')} />);
    // Link 9 starts at 900 px; centred in a 390 px row → 900 − (390 − 100) / 2 = 755.
    expect(row(container).scrollLeft).toBe(755);

    rerender(<SideNav label="Разделы" items={items('s13')} />);
    // The last link cannot be centred: the row stops at its end (1400 − 390).
    expect(row(container).scrollLeft).toBe(1010);

    rerender(<SideNav label="Разделы" items={items('s0')} />);
    expect(row(container).scrollLeft).toBe(0);
  });

  it('leaves a row that fits alone', () => {
    fakeLayout(2000);
    const { container } = render(<SideNav label="Разделы" items={items('s9')} />);
    expect(row(container).scrollLeft).toBe(0);
  });
});
