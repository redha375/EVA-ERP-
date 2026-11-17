export type EvaMode = "1_couleur" | "bicolor" | "inactif";

export interface EvaStationInput {
  active: boolean;
  productionMode: EvaMode;
  mould1Active: boolean;
  mould2Active: boolean;
}

export function isEvaStationAvailable(station: EvaStationInput | null | undefined): boolean {
  return Boolean(station && station.active && station.productionMode !== "inactif" && (station.mould1Active || station.mould2Active));
}

export function initializeNewCartonProgress(colorName: string) {
  return { currentStep: 1 as const, color1: colorName, color2: null, color3: null };
}

export interface ProductionLineInput {
  fullCartons?: number | null;
  openCartons?: number | null;
  loosePairs?: number | null;
  pairsPerCarton?: number | null;
  qtyProduced?: number | null;
  qtyConforming?: number | null;
  qtyRejected?: number | null;
  counterStart?: number | null;
  counterEnd?: number | null;
  modelRecognition: "validated" | "needs_review" | "new_model";
}

export interface ProductionEvaluation {
  calculatedPairsFromFullCartons: number | null;
  status: "validated" | "needs_review" | "conflict";
  alerts: string[];
  notes: string[];
}

export function calculateStationPairsPerCycle(station: EvaStationInput): number {
  if (!station.active || station.productionMode === "inactif") return 0;
  const activeMoulds = Number(station.mould1Active) + Number(station.mould2Active);
  if (activeMoulds === 0) return 0;
  if (station.productionMode === "1_couleur") return activeMoulds * 2;
  return activeMoulds === 2 ? 2 : 1;
}

export function calculateMachineCapacityPerCycle(stations: EvaStationInput[]): number {
  return stations.reduce((total, station) => total + calculateStationPairsPerCycle(station), 0);
}

export function evaluateProductionLine(input: ProductionLineInput): ProductionEvaluation {
  const alerts: string[] = [];
  const notes: string[] = [];
  let status: ProductionEvaluation["status"] = "validated";

  const fullCartonsKnown = input.fullCartons != null;
  const pairsPerCartonKnown = input.pairsPerCarton != null;
  const calculatedPairsFromFullCartons = fullCartonsKnown && pairsPerCartonKnown
    ? input.fullCartons! * input.pairsPerCarton!
    : null;

  if (calculatedPairsFromFullCartons != null) {
    notes.push(`${input.fullCartons} carton(s) plein(s) × ${input.pairsPerCarton} paires = ${calculatedPairsFromFullCartons} paires; les cartons ouverts sont exclus.`);
  }
  if ((input.openCartons ?? 0) > 0) {
    notes.push(`${input.openCartons} carton(s) ouvert(s) : non comptabilisé(s) comme cartons pleins.`);
  }
  if ((input.loosePairs ?? 0) > 0) {
    notes.push(`${input.loosePairs} paire(s) en reliquat restent affichées séparément.`);
  }

  if (input.qtyConforming == null) {
    alerts.push("Paires conformes non renseignées : elles ne sont pas déduites de la production totale.");
    status = "needs_review";
  }
  if (input.modelRecognition !== "validated") {
    alerts.push(input.modelRecognition === "new_model" ? "Modèle non répertorié : nouveau modèle à vérifier." : "Modèle/pointure à vérifier dans le référentiel.");
    if (status === "validated") status = "needs_review";
  }

  if (input.qtyProduced != null && input.qtyConforming != null && input.qtyRejected != null) {
    const accounted = input.qtyConforming + input.qtyRejected;
    if (accounted !== input.qtyProduced) {
      alerts.push(`Conflit : ${input.qtyConforming} conformes + ${input.qtyRejected} rebuts = ${accounted}, différent du total ${input.qtyProduced}.`);
      status = "conflict";
    } else {
      notes.push("Équilibre vérifié : conformes + rebuts = production totale.");
    }
  }

  if (input.counterStart != null && input.counterEnd != null && input.counterEnd < input.counterStart) {
    alerts.push("Conflit compteur : le compteur de sortie est inférieur au compteur d’entrée.");
    status = "conflict";
  }

  return { calculatedPairsFromFullCartons, status, alerts, notes };
}

export interface CartonFlowCounts {
  recoveredCartons: number;
  newCartons: number;
  completedCartons: number;
  remainingOpenCartons: number;
}

/** Same physical-carton conservation rule as the supplied CTP flow engine. */
export function calculateCartonFlowCounts(
  stepNumber: 1 | 2 | 3,
  eligibleOpenCartons: number,
  declaredCartons: number,
): CartonFlowCounts {
  const recoveredCartons = Math.min(declaredCartons, eligibleOpenCartons);
  const newCartons = Math.max(0, declaredCartons - eligibleOpenCartons);
  const remainingOpenCartons = stepNumber === 1
    ? declaredCartons
    : Math.max(0, eligibleOpenCartons - recoveredCartons) + newCartons;
  return {
    recoveredCartons,
    newCartons,
    completedCartons: stepNumber === 1 ? declaredCartons : recoveredCartons,
    remainingOpenCartons,
  };
}

export interface CartonClosureInput {
  currentStep: number;
  requiredSteps: number;
  currentPairs: number;
  pairsPerCarton: number;
  stageColors: Array<string | null>;
  modelAndSizeValidated: boolean;
  qualityValidated: boolean;
  authorizedOperatorConfirmed: boolean;
}

export function evaluateCartonClosure(input: CartonClosureInput): {
  canClose: boolean;
  blockReasons: string[];
} {
  const blockReasons: string[] = [];
  if (input.currentStep < input.requiredSteps) blockReasons.push("Toutes les étapes prévues doivent être achevées.");
  if (input.stageColors.slice(0, input.requiredSteps).some((color) => !color?.trim())) blockReasons.push("Chaque étape couleur doit être renseignée; une étape manquante ne peut pas être présumée.");
  if (input.currentPairs < input.pairsPerCarton) blockReasons.push("La quantité de paires requise n’est pas complète; le carton reste ouvert.");
  if (!input.modelAndSizeValidated) blockReasons.push("La configuration modèle/pointure doit être vérifiée.");
  if (!input.qualityValidated) blockReasons.push("Le contrôle qualité requis n’est pas validé.");
  if (!input.authorizedOperatorConfirmed) blockReasons.push("La confirmation d’un opérateur autorisé est requise.");
  return { canClose: blockReasons.length === 0, blockReasons };
}
