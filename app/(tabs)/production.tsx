import { useMemo, useState } from "react";
import { Modal, Text, View } from "react-native";
import { CtpAccessGate } from "@/components/ctp/access";
import { BrandHeader, Card, CtpPage, Field, InfoBox, PageHeading, Pill, PrimaryButton, SectionTitle, SmallButton } from "@/components/ctp/ui";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

const numberValue = (value: string) => value.trim() === "" ? null : Number(value);
const statusText: Record<string, string> = { draft: "Brouillon", awaiting_manager: "En revue Gérant", awaiting_controller: "Approbation finale", returned: "Retournée", approved: "Approuvée" };

type TransitionAction = "submit" | "gerant_confirm" | "gerant_return" | "final_approve" | "final_return";

export default function ProductionScreen() {
  return <CtpAccessGate><ProductionContent /></CtpAccessGate>;
}

function ProductionContent() {
  const colors = useColors();
  const session = trpc.ctp.session.useQuery(undefined, { retry: false });
  const scopes = trpc.ctp.scopes.useQuery(undefined, { retry: false });
  const entries = trpc.ctp.production.list.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [scopeIndex, setScopeIndex] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState<"matin" | "soir" | "nuit">("matin");
  const [stationNumber, setStationNumber] = useState("1");
  const [modelName, setModelName] = useState("");
  const [sizeRange, setSizeRange] = useState("");
  const [color1, setColor1] = useState("");
  const [color2, setColor2] = useState("");
  const [qtyProduced, setQtyProduced] = useState("");
  const [qtyConforming, setQtyConforming] = useState("");
  const [qtyRejected, setQtyRejected] = useState("");
  const [qtySecondChoice, setQtySecondChoice] = useState("");
  const [counterStart, setCounterStart] = useState("");
  const [counterEnd, setCounterEnd] = useState("");
  const [fullCartons, setFullCartons] = useState("");
  const [openCartons, setOpenCartons] = useState("");
  const [loosePairs, setLoosePairs] = useState("");
  const [pairsPerCarton, setPairsPerCarton] = useState("");
  const [materialKg, setMaterialKg] = useState("");
  const [downtimeMinutes, setDowntimeMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [transition, setTransition] = useState<{ id: string; action: TransitionAction; label: string; requiresNote: boolean } | null>(null);
  const [returnReason, setReturnReason] = useState("");

  const role = session.data?.erpRole ?? "";
  const scope = scopes.data?.[scopeIndex];
  const createDraft = trpc.ctp.production.createDraft.useMutation({
    onSuccess: async (result) => {
      const messages = result.evaluation.alerts.length ? result.evaluation.alerts.join(" ") : "Brouillon enregistré dans la base CTP.";
      setNotice(`${messages} Modèle : ${result.modelRecognition === "validated" ? "validé" : "nouveau, à vérifier"}.`);
      await Promise.all([utils.ctp.production.list.invalidate(), utils.ctp.dashboard.invalidate()]);
    },
    onError: (error) => setNotice(error.message),
  });
  const moveWorkflow = trpc.ctp.production.transition.useMutation({
    onSuccess: async () => {
      setNotice("Transition enregistrée et auditée côté serveur.");
      setTransition(null);
      setReturnReason("");
      await Promise.all([utils.ctp.production.list.invalidate(), utils.ctp.dashboard.invalidate()]);
    },
    onError: (error) => setNotice(error.message),
  });

  const today = useMemo(() => new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" }), []);
  const submit = () => {
    if (!scope) { setNotice("Aucun couple équipe–machine actif n’est affecté à ce compte."); return; }
    const optional = (value: string) => numberValue(value);
    createDraft.mutate({
      productionDate: date,
      shift,
      teamId: scope.teamId,
      machineId: scope.machineId,
      stationNumber: Number(stationNumber),
      material: scope.material,
      modelName,
      sizeRange,
      color1: color1 || null,
      color2: color2 || null,
      counterStart: optional(counterStart),
      counterEnd: optional(counterEnd),
      qtyProduced: optional(qtyProduced),
      qtyConforming: optional(qtyConforming),
      qtyRejected: optional(qtyRejected),
      qtySecondChoice: optional(qtySecondChoice),
      fullCartons: optional(fullCartons),
      openCartons: optional(openCartons),
      loosePairs: optional(loosePairs),
      pairsPerCarton: optional(pairsPerCarton),
      materialConsumedKg: materialKg.trim() === "" ? null : Number(materialKg),
      downtimeMinutes: optional(downtimeMinutes),
      notes: notes || null,
    });
  };

  const runTransition = () => {
    if (!transition) return;
    const isReturn = transition.action === "gerant_return" || transition.action === "final_return";
    if (isReturn && !returnReason.trim()) { setNotice("Le motif de retour est obligatoire."); return; }
    moveWorkflow.mutate({ id: transition.id, action: transition.action, note: isReturn ? returnReason.trim() : undefined });
  };

  return (
    <CtpPage>
      <BrandHeader subtitle={`Atelier · ${today}`} />
      <PageHeading eyebrow="Saisie d’atelier" title="Fiche de production" detail="Enregistrez d’abord un brouillon. Les quantités inconnues restent vides et la validation suit des rôles distincts." />
      <InfoBox title="Modèle de machine EVA" detail="6 stations physiques par machine, 2 moules par station (12 moules). Les numéros de poste vont de 1 à 6." />

      <Card>
        <SectionTitle title="Périmètre de saisie" detail="affectations serveur" />
        {scopes.data?.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{scopes.data.map((item, index) => <SmallButton key={`${item.teamId}-${item.machineId}`} label={`${item.teamCode} · ${item.machineCode}`} onPress={() => setScopeIndex(index)} tone={index === scopeIndex ? "blue" : "neutral"} />)}</View> : <Text style={{ color: colors.muted }}>Aucune affectation disponible.</Text>}
        {scope ? <Text style={{ color: colors.muted, fontSize: 12 }}>{scope.material} · {scope.stationCount} stations × {scope.moldsPerStation} moules</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(["matin", "soir", "nuit"] as const).map((item) => <SmallButton key={item} label={item.toUpperCase()} onPress={() => setShift(item)} tone={shift === item ? "blue" : "neutral"} />)}</View>
      </Card>

      <Card>
        <SectionTitle title="Production" detail="les champs vides restent nuls" />
        <Field label="Date (AAAA-MM-JJ)" value={date} onChangeText={setDate} placeholder="2026-11-14" />
        <Field label="Station physique (1–6)" value={stationNumber} onChangeText={setStationNumber} keyboardType="number-pad" />
        <Field label="Modèle" value={modelName} onChangeText={setModelName} placeholder="Nom exact du modèle" />
        <Field label="Pointure / plage" value={sizeRange} onChangeText={setSizeRange} placeholder="Ex. 39/44" />
        <Field label="Couleur 1" value={color1} onChangeText={setColor1} />
        <Field label="Couleur 2 (si bicolore)" value={color2} onChangeText={setColor2} />
        <Field label="Compteur entrée" value={counterStart} onChangeText={setCounterStart} keyboardType="number-pad" />
        <Field label="Compteur sortie" value={counterEnd} onChangeText={setCounterEnd} keyboardType="number-pad" />
        <Field label="Production totale" value={qtyProduced} onChangeText={setQtyProduced} keyboardType="number-pad" />
        <Field label="Pièces conformes" value={qtyConforming} onChangeText={setQtyConforming} keyboardType="number-pad" />
        <Field label="Rebuts" value={qtyRejected} onChangeText={setQtyRejected} keyboardType="number-pad" />
        <Field label="Deuxième choix" value={qtySecondChoice} onChangeText={setQtySecondChoice} keyboardType="number-pad" />
        <Field label="Cartons pleins" value={fullCartons} onChangeText={setFullCartons} keyboardType="number-pad" />
        <Field label="Cartons ouverts" value={openCartons} onChangeText={setOpenCartons} keyboardType="number-pad" />
        <Field label="Paires en reliquat" value={loosePairs} onChangeText={setLoosePairs} keyboardType="number-pad" />
        <Field label="Paires par carton" value={pairsPerCarton} onChangeText={setPairsPerCarton} keyboardType="number-pad" />
        <Field label="Matière consommée (kg)" value={materialKg} onChangeText={setMaterialKg} keyboardType="decimal-pad" />
        <Field label="Arrêt machine (minutes)" value={downtimeMinutes} onChangeText={setDowntimeMinutes} keyboardType="number-pad" />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        <PrimaryButton label={createDraft.isPending ? "Enregistrement…" : "Enregistrer le brouillon"} onPress={submit} disabled={createDraft.isPending || !scope || !modelName.trim() || !sizeRange.trim()} />
        {notice ? <InfoBox title="État de l’opération" detail={notice} tone={createDraft.isError || moveWorkflow.isError ? "danger" : "blue"} /> : null}
      </Card>

      <Card>
        <SectionTitle title="Fiches récentes" detail={`${entries.data?.length ?? 0} enregistrée(s)`} />
        {entries.data?.length ? entries.data.slice(0, 30).map((entry) => (
          <View key={entry.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 7 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.foreground, fontWeight: "800", flex: 1 }}>{entry.modelName} · {entry.material}</Text>
              <Pill label={statusText[entry.workflowStatus] ?? entry.workflowStatus} tone={entry.workflowStatus === "approved" ? "success" : entry.workflowStatus === "returned" ? "danger" : "warning"} />
            </View>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{entry.productionDate} · station {entry.stationNumber} · total {entry.qtyProduced ?? "—"} · conformes {entry.qtyConforming ?? "—"} · rebuts {entry.qtyRejected ?? "—"}</Text>
            {entry.modelRecognition !== "validated" ? <Text style={{ color: colors.warning, fontSize: 11 }}>Modèle non validé dans le référentiel.</Text> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {role === "chef_equipe" && (entry.workflowStatus === "draft" || entry.workflowStatus === "returned") ? <SmallButton label="Soumettre" onPress={() => setTransition({ id: entry.id, action: "submit", label: "Soumettre au Gérant", requiresNote: false })} /> : null}
              {role === "gerant" && entry.workflowStatus === "awaiting_manager" ? <>
                <SmallButton label="Confirmer" onPress={() => setTransition({ id: entry.id, action: "gerant_confirm", label: "Confirmer la fiche", requiresNote: false })} />
                <SmallButton label="Retour + motif" tone="danger" onPress={() => setTransition({ id: entry.id, action: "gerant_return", label: "Retourner au Chef d’équipe", requiresNote: true })} />
              </> : null}
              {role === "amin_final_approver" && entry.workflowStatus === "awaiting_controller" ? <>
                <SmallButton label="Approbation finale" onPress={() => setTransition({ id: entry.id, action: "final_approve", label: "Approuver définitivement", requiresNote: false })} />
                <SmallButton label="Retour + motif" tone="danger" onPress={() => setTransition({ id: entry.id, action: "final_return", label: "Retourner pour correction", requiresNote: true })} />
              </> : null}
            </View>
          </View>
        )) : <Text style={{ color: colors.muted, fontSize: 13 }}>{entries.isLoading ? "Chargement des fiches…" : "Aucune fiche enregistrée dans vos périmètres."}</Text>}
      </Card>

      <Modal transparent visible={Boolean(transition)} animationType="fade" onRequestClose={() => setTransition(null)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(8,17,31,0.64)" }}>
          <Card>
            <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900" }}>{transition?.label}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>Cette transition sera vérifiée côté serveur et inscrite au journal d’audit. Les approbateurs doivent être distincts.</Text>
            {transition?.requiresNote ? <Field label="Motif obligatoire" value={returnReason} onChangeText={setReturnReason} multiline placeholder="Décrire la correction requise" /> : null}
            <PrimaryButton label={moveWorkflow.isPending ? "Enregistrement…" : "Confirmer l’action"} onPress={runTransition} disabled={moveWorkflow.isPending || (Boolean(transition?.requiresNote) && !returnReason.trim())} />
            <PrimaryButton label="Annuler" secondary onPress={() => setTransition(null)} />
          </Card>
        </View>
      </Modal>
    </CtpPage>
  );
}
