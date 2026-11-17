import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Card, InfoBox, Pill, PrimaryButton, SectionTitle, SmallButton } from "@/components/ctp/ui";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const roleOptions = [
  ["admin_general", "Admin général"], ["direction", "Direction"], ["resp_production", "Responsable production"],
  ["gerant", "Gérant"], ["chef_equipe", "Chef d’équipe"], ["resp_qualite", "Responsable qualité"],
  ["resp_maintenance", "Responsable maintenance"], ["resp_stock", "Responsable stock"],
  ["resp_commercial", "Responsable commercial"], ["rh", "RH"], ["operateur", "Opérateur"],
  ["controleur_production", "Contrôleur production"], ["amin_final_approver", "Amin approbateur final"],
] as const;
type Role = (typeof roleOptions)[number][0];

export function AdminAccessPanel() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const session = trpc.ctp.session.useQuery(undefined, { retry: false });
  const directory = trpc.ctp.admin.directory.useQuery(undefined, { enabled: Boolean(session.data?.canProvision), retry: false });
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [active, setActive] = useState(false);
  const [scopeKeys, setScopeKeys] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const setup = trpc.ctp.admin.setupReferences.useMutation({
    onSuccess: (result) => {
      setNotice(`Référentiels prêts : ${result.createdTeams} équipe(s) et ${result.createdMachines} machine(s) ajoutée(s); ${result.preservedMachines} machine(s) existante(s) conservée(s) sans remplacer ses paramètres.`);
      void utils.ctp.admin.directory.invalidate();
    },
    onError: (error) => setNotice(error.message),
  });
  const assign = trpc.ctp.admin.assignUser.useMutation({
    onSuccess: async () => {
      setNotice("Rôle et couples équipe–machine enregistrés côté serveur.");
      await Promise.all([utils.ctp.admin.directory.invalidate(), utils.ctp.session.invalidate()]);
    },
    onError: (error) => setNotice(error.message),
  });
  const selectedUser = directory.data?.users.find((user) => user.id === selectedUserId);
  const choices = useMemo(() => {
    if (!directory.data) return [];
    return directory.data.teams.flatMap((team) => directory.data!.machines.map((machine) => ({
      key: `${team.id}:${machine.id}`,
      label: `${team.code} · ${machine.code}`,
      teamId: team.id,
      machineId: machine.id,
    })));
  }, [directory.data]);

  const selectUser = (userId: number) => {
    const user = directory.data?.users.find((item) => item.id === userId);
    setSelectedUserId(userId);
    setSelectedRole((user?.role as Role | null) ?? null);
    setActive(Boolean(user?.active));
    setScopeKeys(directory.data?.scopes.filter((scope) => scope.userId === userId).map((scope) => `${scope.teamId}:${scope.machineId}`) ?? []);
    setNotice(null);
  };
  const toggleScope = (key: string) => setScopeKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);

  return (
    <View style={{ gap: 14 }}>
      <Card>
        <SectionTitle title="Référentiels de départ" />
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Crée uniquement les lignes de référence manquantes : équipes A/B/C, EVA1–EVA4, PVC1 et SOU1. Les nouvelles EVA démarrent à 6 stations × 2 moules; les paramètres des machines existantes ne sont pas remplacés. Aucun relevé de production n’est seedé.</Text>
        <PrimaryButton label={setup.isPending ? "Préparation…" : "Préparer l’atelier"} onPress={() => setup.mutate()} disabled={setup.isPending} />
      </Card>
      <Card>
        <SectionTitle title="Comptes Manus connus" detail="l’utilisateur doit d’abord se connecter" />
        {directory.isLoading ? <Text style={{ color: colors.muted }}>Chargement des comptes…</Text> : null}
        {directory.error ? <InfoBox title="Répertoire indisponible" detail={directory.error.message} tone="danger" /> : null}
        {directory.data?.users.map((user) => (
          <SmallButton key={user.id} label={`${user.name || user.email || `Compte ${user.id}`} · ${user.role ?? "sans rôle"}${user.platformAdmin === "admin" ? " · admin projet" : ""}`} onPress={() => selectUser(user.id)} tone={selectedUserId === user.id ? "blue" : "neutral"} />
        ))}
        {!directory.isLoading && !directory.data?.users.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Aucun autre compte. Chaque membre doit ouvrir l’application et utiliser OAuth Manus avant d’apparaître ici.</Text> : null}
      </Card>
      {selectedUser ? <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", flex: 1 }}>{selectedUser.name || selectedUser.email || `Compte ${selectedUser.id}`}</Text>
          <Pill label={active ? "Actif" : "Inactif"} tone={active ? "success" : "neutral"} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{selectedUser.email ?? "Adresse e-mail non fournie"}</Text>
        <SectionTitle title="Rôle ERP" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{roleOptions.map(([role, label]) => <SmallButton key={role} label={label} onPress={() => { setSelectedRole(role); setActive(true); }} tone={selectedRole === role ? "blue" : "neutral"} />)}</View>
        <SmallButton label={selectedRole ? "Retirer le rôle ERP" : "Rôle non attribué"} onPress={() => { setSelectedRole(null); setActive(false); }} tone="danger" disabled={!selectedRole} />
        <SectionTitle title="Couples équipe–machine" detail="pas de portée *" />
        {choices.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{choices.map((choice) => <SmallButton key={choice.key} label={choice.label} onPress={() => toggleScope(choice.key)} tone={scopeKeys.includes(choice.key) ? "blue" : "neutral"} />)}</View> : <Text style={{ color: colors.muted, fontSize: 12 }}>Initialisez d’abord les référentiels A/B/C et machines.</Text>}
        <InfoBox title="Portée stricte" detail="Les autorisations métier sont contrôlées côté serveur. Révoquer un couple désactive l’affectation sans supprimer son historique." />
        <PrimaryButton label={assign.isPending ? "Enregistrement…" : "Enregistrer le rôle et les accès"} onPress={() => {
          if (!selectedUser || !selectedRole) { setNotice("Choisissez un rôle avant l’activation."); return; }
          const scopes = choices.filter((choice) => scopeKeys.includes(choice.key)).map(({ teamId, machineId }) => ({ teamId, machineId }));
          assign.mutate({ userId: selectedUser.id, erpRole: selectedRole, active, scopes });
        }} disabled={assign.isPending || !selectedRole} />
      </Card> : null}
      {notice ? <InfoBox title="Administration" detail={notice} tone={setup.isError || assign.isError ? "danger" : "blue"} /> : null}
    </View>
  );
}
