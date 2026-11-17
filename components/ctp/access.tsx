import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { startOAuthLogin } from "@/constants/oauth";
import { trpc } from "@/lib/trpc";
import { BrandHeader, Card, CtpPage, InfoBox, PageHeading, PrimaryButton } from "@/components/ctp/ui";
import { useColors } from "@/hooks/use-colors";

export function CtpAccessGate({ children, allowProvisioningAdmin = false }: { children: React.ReactNode; allowProvisioningAdmin?: boolean }) {
  const colors = useColors();
  const session = trpc.ctp.session.useQuery(undefined, { retry: false, staleTime: 30_000 });
  if (session.isLoading) {
    return <CtpPage><BrandHeader /><View style={{ minHeight: 260, alignItems: "center", justifyContent: "center", gap: 12 }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted }}>Vérification de la session Manus…</Text></View></CtpPage>;
  }
  if (session.error?.data?.code === "UNAUTHORIZED") return <LoginScreen />;
  if (session.error) {
    return <CtpPage><BrandHeader /><PageHeading eyebrow="Connexion requise" title="Serveur indisponible" detail="Le serveur sécurisé n’a pas répondu. Aucune écriture locale ne sera présentée comme synchronisée." /><InfoBox title="État non vérifié" detail="Réessayez lorsque l’API du projet est démarrée et que la connexion réseau est disponible." tone="warning" /></CtpPage>;
  }
  const account = session.data;
  if (!account?.erpActive && !(allowProvisioningAdmin && account?.canProvision)) {
    return <CtpPage><BrandHeader /><PageHeading eyebrow="Accès CTP SMART" title="Affectation requise" detail="Votre identité Manus est reconnue, mais aucun rôle ERP actif ne vous a été attribué." /><InfoBox title="Accès refusé par défaut" detail="Un administrateur doit activer votre rôle et affecter les couples équipe–machine nécessaires. Un profil choisi sur l’appareil ne peut pas accorder l’accès." tone="warning" /></CtpPage>;
  }
  return <>{children}</>;
}

export function LoginScreen() {
  const colors = useColors();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const login = async () => {
    setOpening(true);
    setError(null);
    try {
      await startOAuthLogin();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Connexion Manus indisponible.");
    } finally {
      setOpening(false);
    }
  };
  return (
    <CtpPage>
      <BrandHeader subtitle="ERP industriel · C.T PLAST" />
      <View style={{ flex: 1, minHeight: 350, justifyContent: "center", gap: 18 }}>
        <PageHeading eyebrow="Opérations d’usine" title="Le flux réel, au poste." detail="Production, cartons, qualité et équipes — avec des données vérifiées et un historique conservé côté serveur." />
        <Card>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800" }}>Connexion sécurisée</Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>Utilisez votre compte Manus. Les rôles et les accès équipe–machine sont affectés ensuite par un administrateur CTP.</Text>
          <PrimaryButton label={opening ? "Ouverture…" : "Continuer avec Manus"} onPress={login} disabled={opening} />
          {error ? <InfoBox title="Connexion non terminée" detail={error} tone="danger" /> : null}
        </Card>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>La connexion est nécessaire avant toute lecture ou écriture métier. Aucun compte de démonstration n’est simulé.</Text>
      </View>
    </CtpPage>
  );
}

export function AdminSetupPanel() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const setup = trpc.ctp.admin.setupReferences.useMutation({
    onSuccess: async (result) => {
      setMessage(`Référentiels prêts. ${result.createdTeams} équipe(s) et ${result.createdMachines} machine(s) ajoutée(s); ${result.preservedMachines} machine(s) existante(s) conservée(s) sans remplacement de paramètres.`);
      await utils.ctp.admin.directory.invalidate();
    },
    onError: (error) => setMessage(error.message),
  });
  const [message, setMessage] = useState<string | null>(null);
  return (
    <CtpPage>
      <BrandHeader />
      <PageHeading eyebrow="Configuration initiale" title="Préparer l’atelier" detail="Votre compte peut administrer les affectations, sans hériter d’un accès automatique aux données de production." />
      <Card>
        <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800" }}>Référentiels de départ</Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>Ajoute seulement les équipes A/B/C et les machines EVA1–EVA4, PVC1 et SOU1 manquantes. Les nouvelles EVA démarrent à 6 stations × 2 moules; les machines existantes gardent leur configuration, à vérifier séparément si besoin.</Text>
        <PrimaryButton label={setup.isPending ? "Préparation…" : "Préparer les référentiels"} onPress={() => setup.mutate()} disabled={setup.isPending} />
        {message ? <InfoBox title="Résultat" detail={message} tone={setup.isError ? "danger" : "blue"} /> : null}
      </Card>
      <InfoBox title="Étape suivante" detail="Connectez le compte de chaque membre, puis ouvrez Modules → Administration pour attribuer le rôle ERP et ses couples équipe–machine exacts." />
    </CtpPage>
  );
}
