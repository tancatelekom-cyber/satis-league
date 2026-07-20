export const COLOR_BLIND_DASHBOARD_USER_ID = "b3df7df9-b781-4ba0-8829-97a3aa790229";

const DEFAULT_DASHBOARD_PALETTE = {
  success: "#22c55e",
  near: "#f59e0b",
  risk: "#ef4444",
  noTarget: "#38bdf8"
} as const;

const COLOR_BLIND_DASHBOARD_PALETTE = {
  success: "#0072b2",
  near: "#e69f00",
  risk: "#cc79a7",
  noTarget: "#94a3b8"
} as const;

export function isColorBlindDashboardUser(userId: string | null | undefined) {
  return userId === COLOR_BLIND_DASHBOARD_USER_ID;
}

export function getDashboardPalette(colorBlindMode: boolean) {
  return colorBlindMode ? COLOR_BLIND_DASHBOARD_PALETTE : DEFAULT_DASHBOARD_PALETTE;
}
