export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
// Version is injected at build time by Vite (from git tags).
// __APP_VERSION__ is defined in vite.config.ts via `define`.
// Falls back to "dev" if not injected (e.g., running tests directly).
declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
