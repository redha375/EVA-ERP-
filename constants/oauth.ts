import * as Linking from "expo-linking";
import Constants from "expo-constants";
import * as ReactNative from "react-native";
import * as SecureStore from "expo-secure-store";

// The deep-link scheme comes from app.config.ts (single source of truth). The fallback matches the
// default bundle ID; it must equal NATIVE_OAUTH_SCHEME on the API server.
const schemeFallback = "manus251309797782513";
// Expo types the scheme as string | string[]; the first entry is the app's own scheme.
function firstScheme(scheme: string | string[] | undefined): string | undefined {
  return Array.isArray(scheme) ? scheme[0] : scheme;
}
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const env = {
  portal: extra.oauthPortalUrl ?? process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server: extra.oauthServerUrl ?? process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: extra.appId ?? process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: firstScheme(Constants.expoConfig?.scheme) ?? schemeFallback,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;
export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";
export const PENDING_OAUTH_STATE_KEY = "ctp_pending_oauth_state";

export function getApiBaseUrl(): string {
  if (API_BASE_URL) return API_BASE_URL.replace(/\/$/, "");
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) return `${protocol}//${apiHostname}`;
  }
  return "";
}

export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") return `${getApiBaseUrl()}/api/oauth/callback`;
  if (Constants.executionEnvironment === "storeClient") return Linking.createURL("oauth/callback");
  return `${env.deepLinkScheme}://oauth/callback`;
};

export async function getLoginUrl(): Promise<string> {
  if (!env.portal || !env.appId) throw new Error("La configuration de connexion Manus est indisponible.");
  const platform: "web" | "native" = ReactNative.Platform.OS === "web" ? "web" : "native";
  const redirectUri = getRedirectUri();
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/oauth/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ platform, redirectUri }),
  });
  if (!response.ok) throw new Error(`Le serveur n’a pas pu créer l’état de connexion (${response.status}).`);
  const { state } = await response.json() as { state?: string };
  if (typeof state !== "string" || !state) throw new Error("Le serveur n’a pas émis d’état de connexion valide.");

  if (platform === "native") await SecureStore.setItemAsync(PENDING_OAUTH_STATE_KEY, state);
  const url = new URL(`${env.portal}/app-auth`);
  url.searchParams.set("appId", env.appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("responseType", "code");
  return url.toString();
}

export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = await getLoginUrl();
  if (ReactNative.Platform.OS === "web") {
    if (typeof window !== "undefined") window.location.href = loginUrl;
    return null;
  }
  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) throw new Error("Aucun navigateur compatible n’a pu ouvrir la page de connexion.");
  await Linking.openURL(loginUrl);
  return null;
}
