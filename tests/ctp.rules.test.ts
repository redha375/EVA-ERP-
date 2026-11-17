import { describe, expect, it } from "vitest";
import {
  calculateCartonFlowCounts,
  calculateMachineCapacityPerCycle,
  evaluateCartonClosure,
  evaluateProductionLine,
  initializeNewCartonProgress,
  isEvaStationAvailable,
} from "../lib/ctp/rules";

describe("CTP production rules", () => {
  it("does not infer conforming pairs from total production", () => {
    const result = evaluateProductionLine({ qtyProduced: 120, modelRecognition: "validated" });
    expect(result.status).toBe("needs_review");
    expect(result.alerts.join(" ")).toContain("ne sont pas déduites");
  });

  it("counts only full cartons in the carton calculation", () => {
    const result = evaluateProductionLine({
      fullCartons: 4,
      openCartons: 2,
      loosePairs: 3,
      pairsPerCarton: 12,
      qtyConforming: 48,
      modelRecognition: "validated",
    });
    expect(result.calculatedPairsFromFullCartons).toBe(48);
    expect(result.notes.join(" ")).toContain("2 carton(s) ouvert(s)");
    expect(result.notes.join(" ")).toContain("reliquat restent affichées séparément");
  });

  it("flags an accounting mismatch instead of silently correcting it", () => {
    const result = evaluateProductionLine({
      qtyProduced: 100,
      qtyConforming: 80,
      qtyRejected: 15,
      modelRecognition: "validated",
    });
    expect(result.status).toBe("conflict");
    expect(result.alerts.join(" ")).toContain("différent du total 100");
  });

  it("uses six physical stations with two moulds each for the one-colour capacity", () => {
    const stations = Array.from({ length: 6 }, () => ({
      active: true as const,
      productionMode: "1_couleur" as const,
      mould1Active: true,
      mould2Active: true,
    }));
    expect(calculateMachineCapacityPerCycle(stations)).toBe(24);
  });

  it("refuses EVA production at an inactive, unconfigured, or mouldless station", () => {
    expect(isEvaStationAvailable(null)).toBe(false);
    expect(isEvaStationAvailable({ active: false, productionMode: "1_couleur", mould1Active: true, mould2Active: true })).toBe(false);
    expect(isEvaStationAvailable({ active: true, productionMode: "inactif", mould1Active: true, mould2Active: true })).toBe(false);
    expect(isEvaStationAvailable({ active: true, productionMode: "1_couleur", mould1Active: false, mould2Active: false })).toBe(false);
    expect(isEvaStationAvailable({ active: true, productionMode: "bicolor", mould1Active: false, mould2Active: true })).toBe(true);
  });

  it("starts a surplus carton at the first stage so later-stage surplus remains recoverable", () => {
    expect(initializeNewCartonProgress("Bleu")).toEqual({ currentStep: 1, color1: "Bleu", color2: null, color3: null });
  });

  it("conserves physical carton identities and reports reused versus new cartons", () => {
    expect(calculateCartonFlowCounts(2, 30, 36)).toEqual({
      recoveredCartons: 30,
      newCartons: 6,
      completedCartons: 30,
      remainingOpenCartons: 6,
    });
  });

  it("counts all cartons declared at step one as having completed that stage", () => {
    expect(calculateCartonFlowCounts(1, 0, 7)).toEqual({
      recoveredCartons: 0,
      newCartons: 7,
      completedCartons: 7,
      remainingOpenCartons: 7,
    });
  });

  it("blocks carton closure until every required condition passes", () => {
    const blocked = evaluateCartonClosure({
      currentStep: 2,
      requiredSteps: 3,
      currentPairs: 12,
      pairsPerCarton: 12,
      stageColors: ["vert", "bleu", null],
      modelAndSizeValidated: true,
      qualityValidated: false,
      authorizedOperatorConfirmed: true,
    });
    expect(blocked.canClose).toBe(false);
    expect(blocked.blockReasons).toHaveLength(3);
    const ready = evaluateCartonClosure({
      currentStep: 3,
      requiredSteps: 3,
      currentPairs: 12,
      pairsPerCarton: 12,
      stageColors: ["vert", "bleu", "rouge"],
      modelAndSizeValidated: true,
      qualityValidated: true,
      authorizedOperatorConfirmed: true,
    });
    expect(ready).toEqual({ canClose: true, blockReasons: [] });
  });

  it("does not close a carton that jumped directly to a later stage", () => {
    const result = evaluateCartonClosure({
      currentStep: 3,
      requiredSteps: 3,
      currentPairs: 12,
      pairsPerCarton: 12,
      stageColors: [null, "bleu", "rouge"],
      modelAndSizeValidated: true,
      qualityValidated: true,
      authorizedOperatorConfirmed: true,
    });
    expect(result.canClose).toBe(false);
    expect(result.blockReasons.join(" ")).toContain("étape manquante");
  });
});
