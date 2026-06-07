export type ThreadWindowSidebarLayout = {
  isSidebarVisible: boolean;
  sidebarWidth: number;
  gridTemplateColumns: string;
};

const SIDEBAR_RATIO = 0.3;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 320;
const SIDEBAR_HIDE_BELOW_WIDTH = 760;

export function getThreadWindowSidebarLayout(windowWidth: number): ThreadWindowSidebarLayout {
  if (!Number.isFinite(windowWidth) || windowWidth < SIDEBAR_HIDE_BELOW_WIDTH) {
    return {
      isSidebarVisible: false,
      sidebarWidth: 0,
      gridTemplateColumns: "minmax(0, 1fr)",
    };
  }

  const scaledWidth = Math.round(windowWidth * SIDEBAR_RATIO);
  const sidebarWidth = Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, scaledWidth)
  );

  return {
    isSidebarVisible: true,
    sidebarWidth,
    gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)`,
  };
}
