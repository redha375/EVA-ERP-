import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CtpPage, InfoBox } from "@/components/ctp/ui";
import { trpc } from "@/lib/trpc";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { PENDING_OAUTH_STATE_KEY } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";

type CallbackStatus = "processing" | "success" | "error";

export default function OAuthCallback() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handled = useRef(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const code = typeof params.code === "string" ? params.code : null;
    const state = typeof params.state === "string" ? params.state : null;
    const providerError = typeof params.error === "string" ? params.error : null;

    const complete = async () => {
      try {
        if (providerError) throw new Error("La connexion Manus a été annulée ou refusée.");
        if (!code || !state) throw new Error("Le callback ne contient pas le code et l’état attendus.");
        const expectedState = await SecureStore.getItemAsync(PENDING_OAUTH_STATE_KEY);
        await SecureStore.deleteItemAsync(PENDING_OAUTH_STATE_KEY);
        if (!expectedState || expectedState !== state) throw new Error("État de connexion différent de celui initié sur cet appareil.");

        const result = await Api.exchangeOAuthCode(code, state);
        if (!result.sessionToken) throw new Error("Le serveur n’a pas renvoyé de session authentifiée.");
        await Auth.setSessionToken(result.sessionToken);
        if (result.user?.id && result.user?.openId) {
          await Auth.setUserInfo({
            id: Number(result.user.id),
            openId: String(result.user.openId),
            name: result.user.name ?? null,
            email: result.user.email ?? null,
            loginMethod: result.user.loginMethod ?? null,
            lastSignedIn: new Date(result.user.lastSignedIn || Date.now()),
          });
        }
        await utils.invalidate();
        setStatus("success");
        setTimeout(() => router.replace("/(tabs)"), 450);
      } catch (error) {
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Impossible de terminer la connexion.");
      }
    };
    void complete();
  }, [params.code, params.state, params.error, router, utils]);

  return <CtpPage>
    <View style={{ minHeight: 300, justifyContent: "center", alignItems: "center", gap: 16 }}>
      {status === "processing" ? <ActivityIndicator size="large" color={colors.primary} /> : null}
      <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", textAlign: "center" }}>{status === "processing" ? "Vérification Manus" : status === "success" ? "Connexion établie" : "Connexion interrompue"}</Text>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: "center" }}>{status === "processing" ? "Vérification de l’état de sécurité et création d’une session serveur." : status === "success" ? "Votre identité a été authentifiée; les droits ERP restent vérifiés séparément." : errorMessage}</Text>
      {status === "error" ? <InfoBox title="État de connexion non validé" detail={errorMessage ?? "Relancez la connexion Manus depuis l’application."} tone="danger" /> : null}
    </View>
  </CtpPage>;
}
