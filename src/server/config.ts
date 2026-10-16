import "server-only";

/** Demo mode seeds the Expo story, shows demo sign-in shortcuts and the demo MFA helper. Default on. */
export function demoMode(): boolean {
  return process.env.FABRIK_DEMO_MODE !== "false";
}
