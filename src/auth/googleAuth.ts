import { AuthConfig } from "./authConfig";

export interface GoogleUserProfile {
  email: string;
  name: string;
  pictureUrl?: string | null;
}

export interface GoogleAuthClient {
  getAuthorizationUrl(state: string): string;
  fetchUserProfile(code: string): Promise<GoogleUserProfile>;
}

export class GoogleOAuthClient implements GoogleAuthClient {
  constructor(private readonly config: AuthConfig) {}

  getAuthorizationUrl(state: string) {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", this.config.googleClientId ?? "");
    url.searchParams.set("redirect_uri", this.config.googleRedirectUri ?? "");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "online");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  async fetchUserProfile(code: string): Promise<GoogleUserProfile> {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      body: new URLSearchParams({
        client_id: this.config.googleClientId ?? "",
        client_secret: this.config.googleClientSecret ?? "",
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.googleRedirectUri ?? ""
      }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      method: "POST"
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange the Google authorization code.");
    }

    const tokenBody = (await tokenResponse.json()) as {
      access_token?: string;
    };

    if (!tokenBody.access_token) {
      throw new Error("Google did not return an access token.");
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenBody.access_token}`
      }
    });

    if (!profileResponse.ok) {
      throw new Error("Failed to fetch the Google user profile.");
    }

    const profile = (await profileResponse.json()) as {
      email?: string;
      name?: string;
      picture?: string;
    };

    if (!profile.email || !profile.name) {
      throw new Error("Google did not return a usable profile.");
    }

    return {
      email: profile.email,
      name: profile.name,
      pictureUrl: profile.picture ?? null
    };
  }
}
