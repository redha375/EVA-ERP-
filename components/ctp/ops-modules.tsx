import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Card, Field, InfoBox, Pill, PrimaryButton, SectionTitle, SmallButton } from "@/components/ctp/ui";
import { EvaStationPanel } from "@/components/ctp/eva-station-panel";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type BusinessModule = "hr" | "commercial" | "finance";

export function StockPanel() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const items = trpc.ctp.stock.listItems.useQuery(undefined, { retry: false });
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("matière");
  const [unit, setUnit] = useState("kg");
  const [quantity, setQuantity] = useState("");
  const [movementQty, setMovementQty] = useState("");
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const create = trpc.ctp.stock.createItem.useMutation({ onSuccess: async () => { setNotice("Article stocké dans MySQL."); setSku(""); setName(""); setQuantity(""); await utils.ctp.stock.listItems.invalidate(); }, onError: (error) => setNotice(error.message) });
  const move = trpc.ctp.stock.move.useMutation({ onSuccess: async () => { setNotice("Mouvement et quantité courante enregistrés de façon atomique."); setMovementQty(""); await utils.ctp.stock.listItems.invalidate(); }, onError: (error) => setNotice(error.message) });
  return <View style={{ gap: 12 }}>
    <Card><SectionTitle title="Articles en stock" detail={`${items.data?.length ?? 0}`} />
      {items.data?.map((item) => <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, gap: 4 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ color: colors.foreground, fontWeight: "800", flex: 1 }}>{item.name}</Text><Pill label={`${item.quantity} ${item.unit}`} tone={item.lowStockThreshold && Number(item.quantity) <= Number(item.lowStockThreshold) ? "warning" : "neutral"} /></View>
        <Text style={{ color: colors.muted, fontSize: 11 }}>{item.sku} · {item.category}</Text>
        <SmallButton label={selectedItem === item.id ? "Article sélectionné" : "Sélectionner pour mouvement"} onPress={() => setSelectedItem(item.id)} tone={selectedItem === item.id ? "blue" : "neutral"} />
      </View>)}
      {!items.data?.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>{items.isLoading ? "Chargement…" : "Aucun article enregistré."}</Text> : null}
    </Card>
    <Card><SectionTitle title="Nouvel article" /><Field label="Référence SKU" value={sku} onChangeText={setSku} /><Field label="Nom" value={name} onChangeText={setName} /><Field label="Catégorie" value={category} onChangeText={setCategory} /><Field label="Unité" value={unit} onChangeText={setUnit} /><Field label="Quantité initiale" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" /><PrimaryButton label={create.isPending ? "Enregistrement…" : "Créer l’article"} onPress={() => create.mutate({ sku, name, category, unit, quantity: Number(quantity) })} disabled={create.isPending || !sku.trim() || !name.trim() || !Number.isFinite(Number(quantity)) || quantity === ""} /></Card>
    <Card><SectionTitle title="Mouvement de stock" /><Text style={{ color: colors.muted, fontSize: 12 }}>Une sortie supérieure à la quantité disponible est refusée; chaque mouvement reçoit un acteur et une entrée d’audit serveur.</Text><Field label="Quantité" value={movementQty} onChangeText={setMovementQty} keyboardType="decimal-pad" /><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><SmallButton label="Entrée" onPress={() => selectedItem && move.mutate({ itemId: selectedItem, movementType: "in", quantity: Number(movementQty) })} disabled={!selectedItem || !Number(movementQty) || move.isPending} /></View><View style={{ flex: 1 }}><SmallButton label="Sortie" tone="danger" onPress={() => selectedItem && move.mutate({ itemId: selectedItem, movementType: "out", quantity: Number(movementQty) })} disabled={!selectedItem || !Number(movementQty) || move.isPending} /></View></View></Card>
    {notice ? <InfoBox title="Stock" detail={notice} tone={create.isError || move.isError ? "danger" : "blue"} /> : null}
  </View>;
}

export function QualityPanel() {
  const colors = useColors();
  const scopes = trpc.ctp.scopes.useQuery(undefined, { retry: false });
  const records = trpc.ctp.quality.list.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [scopeIndex, setScopeIndex] = useState(0);
  const [cartonId, setCartonId] = useState("");
  const [productionEntryId, setProductionEntryId] = useState("");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const scope = scopes.data?.[scopeIndex];
  const save = trpc.ctp.quality.record.useMutation({ onSuccess: async () => { setNotice("Résultat qualité persisté; l’état du carton a été actualisé côté serveur."); setCartonId(""); setProductionEntryId(""); setNotes(""); await Promise.all([utils.ctp.quality.list.invalidate(), utils.ctp.cartons.listOpen.invalidate()]); }, onError: (error) => setNotice(error.message) });
  return <View style={{ gap: 12 }}>
    <Card><SectionTitle title="Contrôle qualité" detail="réservé au rôle qualité" /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{scopes.data?.map((item, index) => <SmallButton key={`${item.teamId}-${item.machineId}`} label={`${item.teamCode} · ${item.machineCode}`} onPress={() => setScopeIndex(index)} tone={index === scopeIndex ? "blue" : "neutral"} />)}</View><Field label="ID carton (ou laisser vide)" value={cartonId} onChangeText={setCartonId} /><Field label="ID fiche de production (ou laisser vide)" value={productionEntryId} onChangeText={setProductionEntryId} /><Field label="Notes de contrôle" value={notes} onChangeText={setNotes} multiline /><View style={{ flexDirection: "row", gap: 8 }}><View style={{ flex: 1 }}><SmallButton label="Conforme" onPress={() => scope && save.mutate({ teamId: scope.teamId, machineId: scope.machineId, cartonId: cartonId || undefined, productionEntryId: productionEntryId || undefined, result: "approved", notes: notes || undefined })} disabled={!scope || (!cartonId && !productionEntryId) || save.isPending} /></View><View style={{ flex: 1 }}><SmallButton label="Non conforme" tone="danger" onPress={() => scope && save.mutate({ teamId: scope.teamId, machineId: scope.machineId, cartonId: cartonId || undefined, productionEntryId: productionEntryId || undefined, result: "rejected", notes: notes || undefined })} disabled={!scope || (!cartonId && !productionEntryId) || save.isPending} /></View></View></Card>
    <Card><SectionTitle title="Historique qualité" />{records.data?.map((record) => <View key={record.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 3 }}><Text style={{ color: colors.foreground, fontWeight: "700" }}>{record.cartonId ?? record.productionEntryId ?? record.id}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{record.result} · {record.createdAt.toLocaleString("fr-FR")}</Text></View>)}{!records.data?.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Aucun contrôle enregistré.</Text> : null}</Card>
    {notice ? <InfoBox title="Qualité" detail={notice} tone={save.isError ? "danger" : "blue"} /> : null}
  </View>;
}

export function MaintenancePanel() {
  const colors = useColors();
  const scopes = trpc.ctp.scopes.useQuery(undefined, { retry: false });
  const tickets = trpc.ctp.maintenance.list.useQuery(undefined, { retry: false });
  const session = trpc.ctp.session.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [scopeIndex, setScopeIndex] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "critical">("normal");
  const [notice, setNotice] = useState<string | null>(null);
  const scope = scopes.data?.[scopeIndex];
  const create = trpc.ctp.maintenance.create.useMutation({ onSuccess: async () => { setNotice("Ticket enregistré sur la machine et le périmètre sélectionnés."); setTitle(""); setDescription(""); await Promise.all([utils.ctp.maintenance.list.invalidate(), utils.ctp.dashboard.invalidate()]); }, onError: (error) => setNotice(error.message) });
  const setStatus = trpc.ctp.maintenance.setStatus.useMutation({ onSuccess: async () => { setNotice("Statut de maintenance enregistré."); await utils.ctp.maintenance.list.invalidate(); }, onError: (error) => setNotice(error.message) });
  const mayCreate = ["resp_maintenance", "resp_production", "chef_equipe", "operateur"].includes(session.data?.erpRole ?? "");
  return <View style={{ gap: 12 }}>
    {mayCreate ? <Card><SectionTitle title="Signaler un arrêt / intervention" /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{scopes.data?.map((item, index) => <SmallButton key={`${item.teamId}-${item.machineId}`} label={`${item.teamCode} · ${item.machineCode}`} onPress={() => setScopeIndex(index)} tone={index === scopeIndex ? "blue" : "neutral"} />)}</View><Field label="Objet" value={title} onChangeText={setTitle} /><Field label="Description" value={description} onChangeText={setDescription} multiline /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{(["low", "normal", "high", "critical"] as const).map((item) => <SmallButton key={item} label={item} onPress={() => setPriority(item)} tone={priority === item ? "blue" : "neutral"} />)}</View><PrimaryButton label={create.isPending ? "Enregistrement…" : "Créer le ticket"} onPress={() => scope && create.mutate({ teamId: scope.teamId, machineId: scope.machineId, title, description, priority })} disabled={!scope || !title.trim() || create.isPending} /></Card> : null}
    <Card><SectionTitle title="Tickets ouverts et récents" />{tickets.data?.map((ticket) => <View key={ticket.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, gap: 5 }}><View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Text style={{ flex: 1, color: colors.foreground, fontWeight: "800" }}>{ticket.title}</Text><Pill label={ticket.priority} tone={ticket.priority === "critical" || ticket.priority === "high" ? "warning" : "neutral"} /></View><Text style={{ color: colors.muted, fontSize: 12 }}>{ticket.status} · équipe {ticket.teamId} · machine {ticket.machineId}</Text>{session.data?.erpRole === "resp_maintenance" && ticket.status !== "resolved" ? <View style={{ flexDirection: "row", gap: 7 }}><SmallButton label="En cours" onPress={() => setStatus.mutate({ id: ticket.id, status: "in_progress" })} /><SmallButton label="Résolu" onPress={() => setStatus.mutate({ id: ticket.id, status: "resolved" })} /></View> : null}</View>)}{!tickets.data?.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Aucun ticket dans vos périmètres.</Text> : null}</Card>
    {notice ? <InfoBox title="Maintenance" detail={notice} tone={create.isError || setStatus.isError ? "danger" : "blue"} /> : null}
  </View>;
}

export function BusinessPanel({ module, label }: { module: BusinessModule; label: string }) {
  const colors = useColors();
  const scopes = trpc.ctp.scopes.useQuery(undefined, { retry: false });
  const records = trpc.ctp.business.list.useQuery({ module }, { retry: false });
  const utils = trpc.useUtils();
  const [scopeIndex, setScopeIndex] = useState(0);
  const [recordType, setRecordType] = useState(module === "hr" ? "personnel" : module === "commercial" ? "vente" : "finance");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const scope = scopes.data?.[scopeIndex];
  const create = trpc.ctp.business.create.useMutation({ onSuccess: async () => { setNotice(`${label} enregistré de façon persistante.`); setTitle(""); setAmount(""); setDetails(""); await records.refetch(); }, onError: (error) => setNotice(error.message) });
  return <View style={{ gap: 12 }}>
    <Card><SectionTitle title={`Nouveau dossier · ${label}`} detail="périmètre obligatoire" /><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{scopes.data?.map((item, index) => <SmallButton key={`${item.teamId}-${item.machineId}`} label={`${item.teamCode} · ${item.machineCode}`} onPress={() => setScopeIndex(index)} tone={index === scopeIndex ? "blue" : "neutral"} />)}</View><Field label="Type de dossier" value={recordType} onChangeText={setRecordType} /><Field label="Intitulé" value={title} onChangeText={setTitle} /><Field label="Montant / valeur (si applicable, sans devise présumée)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" /><Field label="Détails" value={details} onChangeText={setDetails} multiline /><PrimaryButton label={create.isPending ? "Enregistrement…" : "Enregistrer"} onPress={() => scope && create.mutate({ module, recordType, title, teamId: scope.teamId, machineId: scope.machineId, payload: { amount: amount.trim() ? Number(amount) : null, details } })} disabled={!scope || !title.trim() || create.isPending} /></Card>
    <Card><SectionTitle title="Dossiers persistés" detail={`${records.data?.length ?? 0}`} />{records.data?.map((record) => <View key={record.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 3 }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{record.title}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>{record.recordType} · {record.createdAt.toLocaleDateString("fr-FR")} · équipe {record.teamId} · machine {record.machineId}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{String(record.payload.details ?? "")}</Text></View>)}{!records.data?.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Aucun dossier enregistré.</Text> : null}</Card>
    {notice ? <InfoBox title={label} detail={notice} tone={create.isError ? "danger" : "blue"} /> : null}
  </View>;
}

export function ReferencePanel() {
  const colors = useColors();
  const session = trpc.ctp.session.useQuery(undefined, { retry: false });
  const models = trpc.ctp.models.list.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [material, setMaterial] = useState<"EVA" | "SOUMELLE" | "PVC">("EVA");
  const [size, setSize] = useState("");
  const [pairs, setPairs] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const canEdit = Boolean(session.data?.canProvision);
  const create = trpc.ctp.models.create.useMutation({ onSuccess: async () => { setNotice("Modèle ajouté au référentiel; les fiches déjà enregistrées ne sont pas réécrites."); setCode(""); setName(""); setSize(""); setPairs(""); await utils.ctp.models.list.invalidate(); }, onError: (error) => setNotice(error.message) });
  return <View style={{ gap: 12 }}>
    {canEdit ? <Card><SectionTitle title="Ajouter une référence" /><Field label="Code modèle" value={code} onChangeText={setCode} /><Field label="Nom du modèle" value={name} onChangeText={setName} /><View style={{ flexDirection: "row", gap: 7 }}>{(["EVA", "SOUMELLE", "PVC"] as const).map((item) => <SmallButton key={item} label={item} onPress={() => setMaterial(item)} tone={material === item ? "blue" : "neutral"} />)}</View><Field label="Pointure / plage" value={size} onChangeText={setSize} /><Field label="Paires par carton" value={pairs} onChangeText={setPairs} keyboardType="number-pad" /><PrimaryButton label="Ajouter au référentiel" onPress={() => create.mutate({ modelCode: code, modelName: name, material, sizeRange: size, pairsPerCarton: Number(pairs) })} disabled={create.isPending || !code.trim() || !name.trim() || !size.trim() || !Number(pairs)} /></Card> : <InfoBox title="Référentiel en lecture seule" detail="Un Admin CTP ajoute les modèles/pointures vérifiés. Les fiches non répertoriées sont conservées avec l’état « nouveau modèle » et ne sont pas corrigées silencieusement." />}
    <Card><SectionTitle title="Modèles et pointures" detail={`${models.data?.length ?? 0}`} />{models.data?.map((model) => <View key={model.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 3 }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>{model.modelName} · {model.material}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{model.modelCode} · {model.sizeRange} · {model.pairsPerCarton} paires/carton</Text></View>)}{!models.data?.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Le référentiel de production est vide.</Text> : null}</Card>
    <EvaStationPanel />
    {notice ? <InfoBox title="Référentiels" detail={notice} tone={create.isError ? "danger" : "blue"} /> : null}
  </View>;
}

export function ReportsPanel() {
  const colors = useColors();
  const entries = trpc.ctp.production.list.useQuery(undefined, { retry: false });
  const dashboard = trpc.ctp.dashboard.useQuery(undefined, { retry: false });
  const ranks = useMemo(() => {
    const build = (key: "machineId" | "teamId") => {
      const groups = new Map<number, { id: number; entries: number; produced: number; producedKnown: number; conforming: number; conformingKnown: number; complete: number }>();
      for (const entry of entries.data ?? []) {
        const id = entry[key];
        const group = groups.get(id) ?? { id, entries: 0, produced: 0, producedKnown: 0, conforming: 0, conformingKnown: 0, complete: 0 };
        group.entries += 1;
        if (entry.qtyProduced != null) { group.produced += entry.qtyProduced; group.producedKnown += 1; }
        if (entry.qtyConforming != null) { group.conforming += entry.qtyConforming; group.conformingKnown += 1; }
        if (entry.qtyProduced != null && entry.qtyConforming != null) group.complete += 1;
        groups.set(id, group);
      }
      return [...groups.values()].sort((a, b) => b.conforming - a.conforming);
    };
    return { machines: build("machineId"), teams: build("teamId") };
  }, [entries.data]);
  const machineLabels = new Map((dashboard.data?.machines ?? []).map((scope) => [scope.machineId, scope.machineCode]));
  const teamLabels = new Map((dashboard.data?.machines ?? []).map((scope) => [scope.teamId, scope.teamCode]));
  const metric = (known: number, total: number) => known ? total.toLocaleString("fr-FR") : "non renseigné";
  return <View style={{ gap: 12 }}>
    <InfoBox title="Classement calculé" detail="Les tableaux sont classés sur les quantités conformes réellement saisies. Une valeur manquante reste affichée « non renseigné »; la complétude du taux n’utilise que les fiches où total et conformes sont renseignés." />
    <Card><SectionTitle title="Rendement par équipe" />{ranks.teams.map((row, index) => <View key={row.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, gap: 3 }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>#{index + 1} · {teamLabels.get(row.id) ?? `Équipe ${row.id}`}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{row.entries} fiche(s) · conformes {metric(row.conformingKnown, row.conforming)} · total {metric(row.producedKnown, row.produced)}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>Complètes pour le calcul : {row.complete}/{row.entries}</Text></View>)}{!ranks.teams.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>{entries.isLoading ? "Calcul…" : "Pas de fiche dans les périmètres accessibles."}</Text> : null}</Card>
    <Card><SectionTitle title="Rendement par machine" />{ranks.machines.map((row, index) => <View key={row.id} style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, gap: 3 }}><Text style={{ color: colors.foreground, fontWeight: "800" }}>#{index + 1} · {machineLabels.get(row.id) ?? `Machine ${row.id}`}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{row.entries} fiche(s) · conformes {metric(row.conformingKnown, row.conforming)} · total {metric(row.producedKnown, row.produced)}</Text><Text style={{ color: colors.muted, fontSize: 11 }}>Complètes pour le calcul : {row.complete}/{row.entries}</Text></View>)}{!ranks.machines.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>{entries.isLoading ? "Calcul…" : "Pas de fiche dans les périmètres accessibles."}</Text> : null}</Card>
  </View>;
}
