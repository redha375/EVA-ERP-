import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { AdminAccessPanel } from "@/components/ctp/admin-access-panel";
import { CtpAccessGate, AdminSetupPanel } from "@/components/ctp/access";
import { BusinessPanel, MaintenancePanel, QualityPanel, ReferencePanel, ReportsPanel, StockPanel } from "@/components/ctp/ops-modules";
import { BrandHeader, Card, CtpPage, InfoBox, PageHeading, Pill, SmallButton } from "@/components/ctp/ui";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type ModuleKey = "stock" | "quality" | "maintenance" | "hr" | "commercial" | "finance" | "reports" | "references" | "admin";
const modules: Array<{ key: ModuleKey; label: string; description: string; icon: keyof typeof Ionicons.glyphMap; roles: string[] }> = [
  { key: "stock", label: "Stock & matières", description: "Articles, seuils et mouvements persistés", icon: "layers-outline", roles: ["resp_stock"] },
  { key: "quality", label: "Qualité", description: "Contrôles et libération des cartons", icon: "checkmark-circle-outline", roles: ["resp_qualite"] },
  { key: "maintenance", label: "Maintenance", description: "Tickets, arrêts et interventions", icon: "construct-outline", roles: ["resp_maintenance", "resp_production", "gerant", "chef_equipe", "operateur"] },
  { key: "hr", label: "Ressources humaines", description: "Dossiers RH rattachés à un périmètre", icon: "people-outline", roles: ["rh", "direction"] },
  { key: "commercial", label: "Commercial & ventes", description: "Dossiers commerciaux et suivi", icon: "briefcase-outline", roles: ["resp_commercial", "direction"] },
  { key: "finance", label: "Finance & P&L", description: "Entrées financières sans devise présumée", icon: "stats-chart-outline", roles: ["direction", "resp_commercial"] },
  { key: "reports", label: "Rapports", description: "Classement calculé sur les fiches accessibles", icon: "bar-chart-outline", roles: ["admin_general", "direction", "resp_production", "gerant", "chef_equipe", "resp_qualite", "resp_maintenance", "resp_stock", "resp_commercial", "rh", "operateur", "controleur_production", "amin_final_approver"] },
  { key: "references", label: "Référentiels", description: "Modèles, pointures et paires par carton", icon: "book-outline", roles: ["admin_general", "resp_production", "chef_equipe", "operateur", "resp_qualite"] },
  { key: "admin", label: "Administration", description: "Rôles ERP et couples équipe–machine explicites", icon: "shield-checkmark-outline", roles: [] },
];
const roleNames: Record<string, string> = { admin_general: "Admin général", direction: "Direction", resp_production: "Responsable production", gerant: "Gérant", chef_equipe: "Chef d’équipe", resp_qualite: "Responsable qualité", resp_maintenance: "Responsable maintenance", resp_stock: "Responsable stock", resp_commercial: "Responsable commercial", rh: "RH", operateur: "Opérateur", controleur_production: "Contrôleur production", amin_final_approver: "Amin approbateur final" };

export default function ModulesScreen() {
  return <CtpAccessGate allowProvisioningAdmin><ModulesContent /></CtpAccessGate>;
}

function ModulesContent() {
  const colors = useColors();
  const session = trpc.ctp.session.useQuery(undefined, { retry: false });
  const [selected, setSelected] = useState<ModuleKey | null>(null);
  if (session.data?.canProvision && !session.data.erpActive) return <AdminSetupPanel />;
  const role = session.data?.erpRole ?? "";
  if (selected) {
    const info = modules.find((item) => item.key === selected)!;
    return <CtpPage><BrandHeader subtitle="Modules métier" /><SmallButton label="‹ Tous les modules" onPress={() => setSelected(null)} tone="neutral" /><PageHeading eyebrow={roleNames[role] ?? "Compte ERP"} title={info.label} detail={info.description} />
      {selected === "admin" ? <AdminAccessPanel /> : null}
      {selected === "stock" ? <StockPanel /> : null}
      {selected === "quality" ? <QualityPanel /> : null}
      {selected === "maintenance" ? <MaintenancePanel /> : null}
      {selected === "hr" ? <BusinessPanel module="hr" label="RH" /> : null}
      {selected === "commercial" ? <BusinessPanel module="commercial" label="Commercial" /> : null}
      {selected === "finance" ? <BusinessPanel module="finance" label="Finance & P&L" /> : null}
      {selected === "reports" ? <ReportsPanel /> : null}
      {selected === "references" ? <ReferencePanel /> : null}
    </CtpPage>;
  }
  return <CtpPage>
    <BrandHeader subtitle="Pilotage & gestion" />
    <PageHeading eyebrow="Modules CTP" title="À chaque rôle, son périmètre." detail={`Session active : ${roleNames[role] ?? "rôle ERP"}. Les accès aux données sont contrôlés à nouveau par l’API.`} />
    <InfoBox title="Droits explicites" detail="Les modules non autorisés restent signalés, et ne peuvent pas être ouverts en modifiant simplement l’interface." />
    <View style={{ gap: 10 }}>
      {modules.map((item) => {
        const allowed = item.key === "admin" ? Boolean(session.data?.canProvision || role === "admin_general") : item.roles.includes(role);
        const required = item.key === "admin" ? "Admin projet ou Admin général" : item.roles.map((value) => roleNames[value] ?? value).join(" · ");
        return <Card key={item.key} style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: `${colors.primary}16`, alignItems: "center", justifyContent: "center" }}><Ionicons name={item.icon} color={colors.primary} size={21} /></View>
            <View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.foreground, fontWeight: "800", fontSize: 15 }}>{item.label}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>{item.description}</Text></View>
            <Pill label={allowed ? "Autorisé" : "Restreint"} tone={allowed ? "success" : "neutral"} />
          </View>
          {allowed ? <SmallButton label="Ouvrir le module" onPress={() => setSelected(item.key)} /> : <Text style={{ color: colors.muted, fontSize: 10 }}>Rôle requis : {required}</Text>}
        </Card>;
      })}
    </View>
  </CtpPage>;
}
