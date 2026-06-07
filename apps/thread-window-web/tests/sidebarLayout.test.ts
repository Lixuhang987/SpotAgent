import { describe, expect, it } from "vitest";
import { getThreadWindowSidebarLayout } from "../src/utils/sidebarLayout.ts";

describe("ThreadWindow sidebar layout", () => {
  it("scales the history sidebar from the window width within a max cap", () => {
    expect(getThreadWindowSidebarLayout(920)).toEqual({
      isSidebarVisible: true,
      sidebarWidth: 276,
      gridTemplateColumns: "276px minmax(0, 1fr)",
    });
  });

  it("caps the history sidebar width on wide windows", () => {
    expect(getThreadWindowSidebarLayout(1440)).toEqual({
      isSidebarVisible: true,
      sidebarWidth: 320,
      gridTemplateColumns: "320px minmax(0, 1fr)",
    });
  });

  it("keeps the history sidebar usable before the narrow-window breakpoint", () => {
    expect(getThreadWindowSidebarLayout(780)).toEqual({
      isSidebarVisible: true,
      sidebarWidth: 234,
      gridTemplateColumns: "234px minmax(0, 1fr)",
    });
  });

  it("hides the history sidebar when the window is too narrow", () => {
    expect(getThreadWindowSidebarLayout(740)).toEqual({
      isSidebarVisible: false,
      sidebarWidth: 0,
      gridTemplateColumns: "minmax(0, 1fr)",
    });
  });
});
