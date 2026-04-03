export type AuthMode = "disabled" | "required";

export interface AuthConfig {
  bootstrapAdminEmails: string[];
  googleClientId: string | null;
  googleClientSecret: string | null;
  googleRedirectUri: string | null;
  mode: AuthMode;
}

function normalizeEmails(rawValue: string | undefined) {
  return (rawValue ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getAuthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  return {
    bootstrapAdminEmails: normalizeEmails(env.CODEXREMOTE_BOOTSTRAP_ADMIN_EMAILS),
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() || null,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET?.trim() || null,
    googleRedirectUri: env.GOOGLE_REDIRECT_URI?.trim() || null,
    mode: env.CODEXREMOTE_AUTH_MODE === "required" ? "required" : "disabled"
  };
}

export function isAuthConfigured(config: AuthConfig) {
  return Boolean(config.googleClientId && config.googleClientSecret && config.googleRedirectUri);
}
