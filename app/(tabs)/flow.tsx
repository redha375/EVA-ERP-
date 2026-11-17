import { useState } from "react";
import { Text, View } from "react-native";
import { CtpAccessGate } from "@/components/ctp/access";
import { BrandHeader, Card, CtpPage, Field, InfoBox, PageHeading, Pill, PrimaryButton, SectionTitle, SmallButton } from "@/components/ctp/ui";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

export default function FlowScreen() {
  return <CtpAccessGate><FlowContent /></CtpAccessGate>;
}

function FlowContent() {
  const colors = useColors();
  const scopes = trpc.ctp.scopes.useQuery(undefined, { retry: false });
  const cartons = trpc.ctp.cartons.listOpen.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [scopeIndex, setScopeIndex] = useState(0);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [modelName, setModelName] = useState("");
  const [sizeRange, setSizeRange] = useState("");
  const [colorName, setColorName] = useState("");
  const [stationNumber, setStationNumber] = useState("1");
  const [declaredCartons, setDeclaredCartons] = useState("");
  const [pairsPerCarton, setPairsPerCarton] = useState("");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const scope = scopes.data?.[scopeIndex];
  const flow = trpc.ctp.cartons.applyFlow.useMutation({
    onSuccess: async (result) => {
      setNotice(`${result.recoveredCartons} carton(s) réutilisé(s), ${result.newCartons} nouveau(x), ${result.remainingOpenCartons} restant(s) ouvert(s). Identifiants conservés par le serveur.`);
      await Promise.all([utils.ctp.cartons.listOpen.invalidate(), utils.ctp.dashboard.invalidate()]);
    },
    onError: (error) => setNotice(error.message),
  });
  const close = trpc.ctp.cartons.close.useMutation({
    onSuccess: async () => {
      setNotice("Carton fermé après contrôles serveur.");
      await utils.ctp.cartons.listOpen.invalidate();
    },
    onError: (error) => setNotice(error.message),
  });

  const apply = () => {
    if (!scope) { setNotice("Aucune affectation active."); return; }
    flow.mutate({
      flowDate: new Date().toISOString().slice(0, 10),
      stepNumber: step,
      modelName,
      sizeRange,
      colorName,
      teamId: scope.teamId,
      machineId: scope.machineId,
      stationNumber: Number(stationNumber),
      declaredCartons: Number(declaredCartons),
      pairsPerCarton: pairsPerCarton.trim() === "" ? undefined : Number(pairsPerCarton),
      notes: notes || undefined,
    });
  };

  return (
    <CtpPage>
      <BrandHeader subtitle="Flux physique · cartons" />
      <PageHeading eyebrow="Traçabilité physique" title="Un carton, un identifiant." detail="Les étapes couleur réutilisent les cartons ouverts éligibles au modèle et à la pointure; elles ne créent pas un nouveau carton à chaque passage." />
      <InfoBox title="Règle de conservation" detail="Le serveur compte séparément les cartons récupérés, les nouveaux, les terminés et les restant ouverts. Un carton incomplet ne peut pas être clôturé." />
      <Card>
        <SectionTitle title="Étape du flux" detail="par couleur" />
        <View style={{ flexDirection: "row", gap: 8 }}>{([1, 2, 3] as const).map((value) => <SmallButton key={value} label={`ÉTAPE ${value}`} onPress={() => setStep(value)} tone={step === value ? "blue" : "neutral"} />)}</View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>À l’étape {step}, les cartons recherchés sont ceux dont la dernière étape achevée est {step - 1}.</Text>
        <SectionTitle title="Affectation" detail="portée serveur" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{scopes.data?.map((item, index) => <SmallButton key={`${item.teamId}-${item.machineId}`} label={`${item.teamCode} · ${item.machineCode}`} onPress={() => setScopeIndex(index)} tone={index === scopeIndex ? "blue" : "neutral"} />)}</View>
        <Field label="Modèle" value={modelName} onChangeText={setModelName} />
        <Field label="Pointure / plage" value={sizeRange} onChangeText={setSizeRange} />
        <Field label="Couleur déclarée pour cette étape" value={colorName} onChangeText={setColorName} />
        <Field label="Station physique (1–6)" value={stationNumber} onChangeText={setStationNumber} keyboardType="number-pad" />
        <Field label="Cartons réellement traités" value={declaredCartons} onChangeText={setDeclaredCartons} keyboardType="number-pad" />
        <Field label="Paires par carton (si modèle non référencé)" value={pairsPerCarton} onChangeText={setPairsPerCarton} keyboardType="number-pad" />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        <PrimaryButton label={flow.isPending ? "Calcul du flux…" : "Calculer et enregistrer l’étape"} onPress={apply} disabled={flow.isPending || !scope || !modelName.trim() || !sizeRange.trim() || !colorName.trim() || !Number(declaredCartons)} />
        {notice ? <InfoBox title="Résultat du flux" detail={notice} tone={flow.isError || close.isError ? "danger" : "blue"} /> : null}
      </Card>

      <Card>
        <SectionTitle title="Cartons ouverts affectés" detail={`${cartons.data?.length ?? 0}`} />
        {cartons.data?.length ? cartons.data.map((carton) => (
          <View key={carton.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 11, gap: 7 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <Text style={{ flex: 1, color: colors.foreground, fontWeight: "800", fontSize: 13 }}>{carton.id}</Text>
              <Pill label={`Étape ${carton.currentStep}/${carton.requiredSteps}`} tone={carton.currentStep === carton.requiredSteps ? "success" : "warning"} />
            </View>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{carton.modelName} · {carton.sizeRange} · {carton.currentPairs}/{carton.pairsPerCarton} paires · {carton.teamId}/{carton.machineId}</Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>Configuration : {carton.configurationValidated ? "vérifiée" : "à vérifier"} · Qualité : {carton.qualityValidated ? "validée" : "en attente"}</Text>
            <SmallButton label="Vérifier et clôturer" onPress={() => close.mutate({ id: carton.id })} tone={carton.currentStep === carton.requiredSteps && carton.configurationValidated && carton.qualityValidated ? "blue" : "neutral"} disabled={close.isPending} />
          </View>
        )) : <Text style={{ color: colors.muted, fontSize: 13 }}>{cartons.isLoading ? "Chargement des cartons…" : "Aucun carton ouvert dans vos périmètres."}</Text>}
      </Card>
    </CtpPage>
  );
}
