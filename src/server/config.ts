import "server-only";

/** Demo mode seeds the Expo story, shows demo sign-in shortcuts and the demo MFA helper. Default on. */
export function demoMode(): boolean {
  return process.env.FABRIK_DEMO_MODE !== "false";
}

/**
 * Screens, widgets and helper text beyond the PRD (see docs/cleanup-audit.md) are hidden unless
 * SHOW_EXTRAS=true. Kept in code rather than deleted where removal could break a flow.
 */
export function showExtras(): boolean {
  return process.env.SHOW_EXTRAS === "true";
}
