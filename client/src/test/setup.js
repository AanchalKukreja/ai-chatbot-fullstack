import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Browser features jsdom does not implement.
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
