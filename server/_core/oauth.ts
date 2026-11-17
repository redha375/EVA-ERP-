import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { ONE_YEAR_MS } from "../../shared/const.js";
import { getDb, getUserByOpenId, upsertUser } from "../db";
import { oauthStates } from "../../drizzle/schema";
import { getSessionCookieName, getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const OAUTH_STATE_COOKIE = "webdev_oauth_state";
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
// Must match the app's deep-link scheme (app.config.ts: manus<timestamp> derived from the bundle ID).
const NATIVE_SCHEME = process.env.NATIVE_OAUTH_SCHEME || "manus251309797782513";

type OAuthPlatform = "web" | "native";
type OAuthStatePayload = { redirectUri: string; nonce: string };

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function encodeState(payload: OAuthStatePayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function decodeState(state: string): OAuthStatePayload | null {
  try {
    const payload = JSON.parse(Buffer.from(state, "base64").toString("utf8")) as Partial<OAuthStatePayload>;
    if (typeof payload.redirectUri !== "string" || typeof payload.nonce !== "string" || payload.nonce.length < 32) return null;
    return { redirectUri: payload.redirectUri, nonce: payload.nonce };
  } catch {
    return null;
  }
}

function publicApiOrigin(req: Request) {
  const forwarded = req.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim().toLowerCase() || req.protocol;
  const host = req.get("host");
  if (!host || (protocol !== "https" && protocol !== "http")) throw new Error("Invalid public API origin");
  return `${protocol}://${host}`;
}

function trustedApiOrigins() {
  const origins = new Set<string>();
  for (const value of [process.env.EXPO_PUBLIC_API_BASE_URL, process.env.EXPO_PACKAGER_PROXY_URL, process.env.EXPO_WEB_PREVIEW_URL]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      origins.add(url.origin);
      const host = url.hostname.replace(/^8081-/, "3000-").replace(/^8328-/, "3000-");
      if (host !== url.hostname) { url.hostname = host; origins.add(url.origin); }
    } catch { /* Ignore absent or malformed optional runtime addresses. */ }
  }
  return origins;
}

function assertTrustedApiOrigin(req: Request, origin: string) {
  const hostname = req.hostname.toLowerCase();
  const loopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (!loopback && !trustedApiOrigins().has(origin)) {
    throw new Error("Untrusted API host");
  }
}

function isAllowedNativeRedirect(redirectUri: string): boolean {
  if (redirectUri === `${NATIVE_SCHEME}://oauth/callback`) return true;
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "exp:" && url.protocol !== "exps:") return false;
    if (url.search || url.hash || !["/--/oauth/callback", "/oauth/callback"].includes(url.pathname)) return false;
    const configured = process.env.EXPO_PACKAGER_PROXY_URL;
    const allowedHosts = new Set<string>();
    if (configured) {
      const packager = new URL(configured);
      allowedHosts.add(packager.host.toLowerCase());
      allowedHosts.add(packager.hostname.replace(/^8081-/, "8328-").toLowerCase());
      allowedHosts.add(packager.hostname.replace(/^8328-/, "8081-").toLowerCase());
    }
    const advertisedHost = process.env.REACT_NATIVE_PACKAGER_HOSTNAME;
    if (advertisedHost) allowedHosts.add(advertisedHost.toLowerCase());
    return allowedHosts.has(url.host.toLowerCase()) || allowedHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function issueOAuthState(req: Request, res: Response) {
  const platform = req.body?.platform as OAuthPlatform;
  const redirectUri = req.body?.redirectUri;
  if ((platform !== "web" && platform !== "native") || typeof redirectUri !== "string" || redirectUri.length > 1024) {
    res.status(400).json({ error: "invalid_oauth_request" });
    return;
  }

  let apiOrigin: string;
  try {
    apiOrigin = publicApiOrigin(req);
    assertTrustedApiOrigin(req, apiOrigin);
    if (platform === "web") {
      if (redirectUri !== `${apiOrigin}/api/oauth/callback`) throw new Error("Invalid web redirect");
      const originHeader = req.headers.origin;
      if (typeof originHeader === "string") {
        const originUrl = new URL(originHeader);
        if (originUrl.protocol !== "https:" && originUrl.hostname !== "localhost" && originUrl.hostname !== "127.0.0.1") throw new Error("Untrusted browser origin");
      }
    } else if (!isAllowedNativeRedirect(redirectUri)) {
      throw new Error("Invalid native redirect");
    }
  } catch {
    res.status(400).json({ error: "untrusted_oauth_redirect" });
    return;
  }

  const db = await getDb();
  if (!db) { res.status(503).json({ error: "oauth_state_storage_unavailable" }); return; }
  const nonce = randomBytes(32).toString("hex");
  const state = encodeState({ redirectUri, nonce });
  const now = new Date();
  try {
    await db.delete(oauthStates).where(lt(oauthStates.expiresAt, now));
    await db.insert(oauthStates).values({
      stateHash: digest(state),
      platform,
      redirectUri,
      nonceHash: digest(nonce),
      expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
    });
    if (platform === "web") {
      res.cookie(OAUTH_STATE_COOKIE, state, { ...getSessionCookieOptions(req), path: "/api/oauth", maxAge: OAUTH_STATE_TTL_MS });
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ state });
  } catch {
    res.status(503).json({ error: "oauth_state_storage_unavailable" });
  }
}

async function consumeOAuthState(state: string, platform: OAuthPlatform): Promise<string | null> {
  const parsed = decodeState(state);
  if (!parsed) return null;
  const db = await getDb();
  if (!db) throw new Error("OAuth state storage unavailable");
  return db.transaction(async (tx) => {
    const [stored] = await tx.select().from(oauthStates).where(eq(oauthStates.stateHash, digest(state))).for("update").limit(1);
    if (!stored || stored.platform !== platform || stored.redirectUri !== parsed.redirectUri || stored.nonceHash !== digest(parsed.nonce) || stored.expiresAt.getTime() <= Date.now()) return null;
    await tx.delete(oauthStates).where(and(eq(oauthStates.stateHash, stored.stateHash), eq(oauthStates.platform, platform)));
    return stored.redirectUri;
  });
}

async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) throw new Error("openId missing from user info");
  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  if (!saved) throw new Error("Authenticated user was not persisted");
  return saved;
}

function buildUserResponse(user: Awaited<ReturnType<typeof getUserByOpenId>>) {
  return {
    id: user?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

export function registerOAuthRoutes(app: Express) {
  app.post("/api/oauth/state", async (req: Request, res: Response) => {
    await issueOAuthState(req, res);
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const cookieState = req.headers.cookie ? parseCookieHeader(req.headers.cookie)[OAUTH_STATE_COOKIE] : undefined;
    const cookieOptions = { ...getSessionCookieOptions(req), path: "/api/oauth", maxAge: -1 };
    res.clearCookie(OAUTH_STATE_COOKIE, cookieOptions);
    if (!code || !state || !cookieState || cookieState !== state) {
      res.status(400).json({ error: "oauth_state_mismatch" });
      return;
    }

    try {
      const redirectUri = await consumeOAuthState(state, "web");
      if (!redirectUri || redirectUri !== `${publicApiOrigin(req)}/api/oauth/callback`) {
        res.status(400).json({ error: "oauth_state_mismatch" });
        return;
      }
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "", expiresInMs: ONE_YEAR_MS });
      res.cookie(getSessionCookieName(req), sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      const frontendUrl = process.env.EXPO_WEB_PREVIEW_URL || process.env.EXPO_PACKAGER_PROXY_URL || "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch {
      console.error("[OAuth] Web callback failed");
      res.status(500).json({ error: "oauth_callback_failed" });
    }
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) { res.status(400).json({ error: "code_and_state_required" }); return; }
    try {
      const redirectUri = await consumeOAuthState(state, "native");
      if (!redirectUri || !isAllowedNativeRedirect(redirectUri)) { res.status(400).json({ error: "oauth_state_mismatch" }); return; }
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || "", expiresInMs: ONE_YEAR_MS });
      res.json({ app_session_id: sessionToken, user: buildUserResponse(user) });
    } catch {
      console.error("[OAuth] Mobile exchange failed");
      res.status(500).json({ error: "oauth_mobile_exchange_failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(getSessionCookieName(req), { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch {
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) { res.status(400).json({ error: "Bearer token required" }); return; }
      const token = authHeader.slice("Bearer ".length).trim();
      res.cookie(getSessionCookieName(req), token, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.json({ success: true, user: buildUserResponse(user) });
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
