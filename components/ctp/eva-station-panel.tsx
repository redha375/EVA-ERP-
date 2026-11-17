import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Card, InfoBox, SectionTitle, SmallButton } from "@/components/ctp/ui";
import { useColors } from "@/hooks/use-colors";
import { calculateMachineCapacityPerCycle } from "@/lib/ctp/rules";
import { trpc } from "@/lib/trpc";

type Mode = "1_couleur" | "bicolor" | "inactif";

export function EvaStationPanel() {
  const colors = useColors();
  const session = trpc.ctp.session.useQuery(undefined, { retry: false });
  const canRead = Boolean(session.data?.canProvision || session.data?.erpRole === "resp_production");
  const canEdit = Boolean(session.data?.canProvision);
  const configs = trpc.ctp.stationConfig.list.useQuery(undefined, { enabled: canRead, retry: false });
  const utils = trpc.useUtils();
  const [notice, setNotice] = useState<string | null>(null);
  const update = trpc.ctp.stationConfig.set.useMutation({
    onSuccess: async () => {
      setNotice("Configuration de station enregistrée et auditée côté serveur.");
      await utils.ctp.stationConfig.list.invalidate();
    },
    onError: (error) => setNotice(error.message),
  });
  const groups = useMemo(() => {
    const rows = configs.data ?? [];
    return [...new Set(rows.map((row) => row.machineId))].map((machineId) => {
      const stations = rows.filter((row) => row.machineId === machineId);
      return { machineId, machineCode: stations[0]?.machineCode ?? `EVA ${machineId}`, machineName: stations[0]?.machineName ?? "Machine", stations };
    });
  }, [configs.data]);

  if (!canRead) {
    return <InfoBox title="Configuration EVA" detail="Les réglages globaux de stations sont accessibles aux administrateurs CTP. Le référentiel utilise six stations et deux moules par poste." />;
  }

  const save = (station: NonNullable<typeof configs.data>[number], patch: Partial<Pick<typeof station, "active" | "productionMode" | "mould1Active" | "mould2Active">>) => {
    update.mutate({
      machineId: station.machineId,
      stationNumber: station.stationNumber,
      active: patch.active ?? station.active,
      productionMode: (patch.productionMode ?? station.productionMode) as Mode,
      mould1Active: patch.mould1Active ?? station.mould1Active,
      mould2Active: patch.mould2Active ?? station.mould2Active,
    });
  };

  return <View style={{ gap: 12 }}>
    <Card>
      <SectionTitle title="Capacité EVA · stations et moules" detail="Six stations physiques × deux moules par machine" />
      {!canEdit ? <InfoBox title="Lecture seule" detail="Le rôle Production peut consulter les réglages de ses machines affectées; seule l’administration CTP peut modifier la configuration globale." /> : null}
      {configs.data?.map((station) => {
        const nextMode: Mode = station.productionMode === "1_couleur" ? "bicolor" : station.productionMode === "bicolor" ? "inactif" : "1_couleur";
        return <View key={`${station.machineId}-${station.stationNumber}`} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, gap: 7 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Text style={{ color: colors.foreground, fontWeight: "800" }}>{station.machineCode} · Poste {station.stationNumber}</Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{station.productionMode === "1_couleur" ? "1 couleur" : station.productionMode === "bicolor" ? "Bicolore" : "Inactif"}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <SmallButton label={station.active ? "Station active" : "Station arrêtée"} tone={station.active ? "blue" : "danger"} disabled={!canEdit || update.isPending} onPress={() => save(station, { active: !station.active })} />
            <SmallButton label="Changer le mode" disabled={!canEdit || update.isPending} onPress={() => save(station, { productionMode: nextMode })} />
            <SmallButton label={`Moule 1 ${station.mould1Active ? "✓" : "—"}`} tone={station.mould1Active ? "blue" : "neutral"} disabled={!canEdit || update.isPending} onPress={() => save(station, { mould1Active: !station.mould1Active })} />
            <SmallButton label={`Moule 2 ${station.mould2Active ? "✓" : "—"}`} tone={station.mould2Active ? "blue" : "neutral"} disabled={!canEdit || update.isPending} onPress={() => save(station, { mould2Active: !station.mould2Active })} />
          </View>
        </View>;
      })}
      {configs.isLoading ? <Text style={{ color: colors.muted, fontSize: 12 }}>Chargement des configurations persistées…</Text> : null}
      {!configs.isLoading && !configs.data?.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Aucune station configurée. L’administrateur peut initialiser les référentiels CTP.</Text> : null}
    </Card>
    {groups.map((group) => {
      const pairsPerCycle = calculateMachineCapacityPerCycle(group.stations.map((station) => ({
        active: station.active,
        productionMode: station.productionMode,
        mould1Active: station.mould1Active,
        mould2Active: station.mould2Active,
      })));
      return <Card key={group.machineId}>
        <SectionTitle title={`Capacité calculée · ${group.machineCode}`} detail={`${group.stations.length} station(s) configurée(s)`} />
        <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "900" }}>{pairsPerCycle} paires / cycle</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Capacité recalculée depuis l’état actif, le mode couleur et les deux moules de chaque station. Ce résultat est une capacité par cycle, pas une prévision horaire.</Text>
      </Card>;
    })}
    {notice ? <InfoBox title="Configuration EVA" detail={notice} tone={update.isError ? "danger" : "blue"} /> : null}
  </View>;
}
