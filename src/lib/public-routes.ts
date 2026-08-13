const PUBLIC_ROUTES = new Set(["/login", "/install", "/reset-password"]);

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.has(pathname);
}
