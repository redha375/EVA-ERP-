import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { CtpAccessGate, AdminSetupPanel } from "@/components/ctp/access";
import { BrandHeader, Card, CtpPage, InfoBox, PageHeading, Pill, PrimaryButton, SectionTitle } from "@/components/ctp/ui";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function HomeScreen() {
  return <CtpAccessGate allowProvisioningAdmin><DashboardContent /></CtpAccessGate>;
}

function DashboardContent() {
  const colors = useColors();
  const router = useRouter();
  const session = trpc.ctp.session.useQuery(undefined, { retry: false });
  const dashboard = trpc.ctp.dashboard.useQuery(undefined, { retry: false, refetchInterval: 45_000 });

  if (session.data?.canProvision && !session.data.erpActive) return <AdminSetupPanel />;
  if (dashboard.error) {
    return <CtpPage><BrandHeader /><PageHeading eyebrow="Atelier" title="Périmètre à configurer" detail={dashboard.error.message} /><InfoBox title="Accès explicite requis" detail="Un compte actif doit recevoir des couples équipe–machine avant toute lecture de production." tone="warning" /></CtpPage>;
  }
  const data = dashboard.data;
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const shortName = session.data?.name?.split(" ")[0] ?? "Équipe";

  return (
    <CtpPage>
      <BrandHeader subtitle={today} />
      <PageHeading eyebrow="Poste de pilotage" title={`Bonjour, ${shortName}`} detail="Vue fondée sur les fiches et affectations réellement persistées." />
      <InfoBox title="Données réelles du compte" detail="Les indicateurs proviennent des 100 dernières fiches accessibles. Une valeur absente n’est pas interprétée comme zéro." />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Kpi label="Paires déclarées" value={data?.totalProduced ?? null} detail={`${data?.producedKnownEntries ?? 0} valeur(s) connue(s) · 100 fiches max.`} color={colors.primary} />
        <Kpi label="Conformes déclarées" value={data?.totalConforming ?? null} detail={`${data?.conformingKnownEntries ?? 0} valeur(s) connue(s) · sans déduction`} color={colors.success} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Kpi label="Fiches approuvées" value={data?.approved ?? 0} detail="workflow finalisé" color={colors.success} />
        <Kpi label="À valider" value={data?.pending ?? 0} detail="dans vos périmètres" color={colors.warning} />
      </View>

      <Card>
        <SectionTitle title="Machines affectées" detail={`${data?.machines.length ?? 0} couple(s)`} />
        {data?.machines.length ? data.machines.map((machine) => (
          <View key={`${machine.teamId}-${machine.machineId}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 6 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800" }}>{machine.machineCode} · {machine.teamName}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{machine.material} · {machine.stationCount} stations × {machine.moldsPerStation} moules</Text>
            </View>
            <Pill label={statusLabel(machine.machineStatus)} tone={machine.machineStatus === "running" ? "success" : machine.machineStatus === "breakdown" ? "danger" : "neutral"} />
          </View>
        )) : <Text style={{ color: colors.muted, fontSize: 13 }}>Aucune machine n’est rattachée à vos affectations.</Text>}
      </Card>

      <View style={{ gap: 9 }}>
        <SectionTitle title="Actions rapides" />
        <PrimaryButton label="Saisir une fiche d’atelier" onPress={() => router.push("/(tabs)/production")} />
        <PrimaryButton label="Traiter un flux de cartons" secondary onPress={() => router.push("/(tabs)/flow")} />
      </View>

      <Card>
        <SectionTitle title="Dernières fiches" detail="accès équipe–machine" />
        {data?.recentEntries.length ? data.recentEntries.map((entry) => (
          <View key={entry.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.foreground, fontWeight: "800", flex: 1 }}>{entry.modelName} · {entry.material}</Text>
              <Pill label={workflowLabel(entry.workflowStatus)} tone={entry.workflowStatus === "approved" ? "success" : entry.workflowStatus === "returned" ? "danger" : "warning"} />
            </View>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{entry.productionDate} · poste {entry.stationNumber} · total {entry.qtyProduced ?? "non renseigné"} · conformes {entry.qtyConforming ?? "non renseigné"}</Text>
          </View>
        )) : <Text style={{ color: colors.muted, fontSize: 13 }}>Aucune fiche enregistrée dans ce périmètre.</Text>}
      </Card>
      {dashboard.isFetching ? <Text style={{ color: colors.muted, textAlign: "center", fontSize: 11 }}>Actualisation…</Text> : null}
    </CtpPage>
  );
}

function Kpi({ label, value, detail, color }: { label: string; value: number | null; detail: string; color: string }) {
  const colors = useColors();
  return <Card style={{ flex: 1, padding: 14, gap: 7 }}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700" }}>{label}</Text><Text style={{ color, fontSize: 25, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{value === null ? "—" : value.toLocaleString("fr-FR")}</Text><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 14 }}>{detail}</Text></Card>;
}

function statusLabel(status: string) {
  return ({ running: "En marche", idle: "En attente", breakdown: "En panne", maintenance: "Maintenance", stopped: "Arrêtée" } as Record<string, string>)[status] ?? status;
}
function workflowLabel(status: string) {
  return ({ draft: "Brouillon", awaiting_manager: "Gérant", awaiting_controller: "Contrôle final", returned: "Retournée", approved: "Approuvée" } as Record<string, string>)[status] ?? status;
}
