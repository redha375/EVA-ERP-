import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  auditLogs,
  businessRecords,
  cartonFlowOperations,
  cartons,
  inventoryItems,
  inventoryMovements,
  machineStations,
  machines,
  maintenanceTickets,
  modelMaster,
  productionEntries,
  qualityRecords,
  teams,
  userMachineScopes,
  users,
  workflowEvents,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import {
  assertScope,
  ERP_ROLES,
  getActiveScopes,
  isProvisioningAdmin,
  listScopeDetails,
  requireCtpAccount,
  requireDatabase,
  requireProvisioningAdmin,
  writeAudit,
  type ErpRole,
} from "./policy";
import { calculateCartonFlowCounts, evaluateCartonClosure, evaluateProductionLine, initializeNewCartonProgress, isEvaStationAvailable } from "../../lib/ctp/rules";

const idInput = z.object({ id: z.string().min(1).max(96) });
const countInput = z.number().int().min(0).max(100000).nullable().optional();
const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const moduleRoles: Record<"hr" | "commercial" | "finance" | "reference", readonly ErpRole[]> = {
  hr: ["rh", "direction"],
  commercial: ["resp_commercial", "direction"],
  finance: ["direction", "resp_commercial"],
  reference: ["admin_general", "resp_production"],
};

function scopedFilter<T extends { teamId: unknown; machineId: unknown }>(
  source: T,
  scopes: Array<{ teamId: number; machineId: number }>,
) {
  if (scopes.length === 0) return undefined;
  return or(...scopes.map((scope) => and(
    eq(source.teamId as never, scope.teamId) as never,
    eq(source.machineId as never, scope.machineId) as never,
  )));
}

function requireSomeScopes(scopes: Array<{ teamId: number; machineId: number }>) {
  if (scopes.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Aucune affectation équipe–machine active n’est configurée." });
  }
}

const productionInput = z.object({
  productionDate: dateInput,
  shift: z.enum(["matin", "soir", "nuit"]),
  teamId: z.number().int().positive(),
  machineId: z.number().int().positive(),
  stationNumber: z.number().int().min(1).max(6),
  material: z.enum(["EVA", "SOUMELLE", "PVC"]),
  modelName: z.string().trim().min(1).max(120),
  sizeRange: z.string().trim().min(1).max(32),
  color1: z.string().trim().max(48).nullable().optional(),
  color2: z.string().trim().max(48).nullable().optional(),
  counterStart: countInput,
  counterEnd: countInput,
  qtyProduced: countInput,
  qtyConforming: countInput,
  qtyRejected: countInput,
  qtySecondChoice: countInput,
  fullCartons: countInput,
  openCartons: countInput,
  loosePairs: countInput,
  pairsPerCarton: z.number().int().min(1).max(100).nullable().optional(),
  materialConsumedKg: z.number().min(0).max(100000).nullable().optional(),
  downtimeMinutes: countInput,
  downtimeReason: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const ctpRouter = router({
  session: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user;
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
    const scopes = await listScopeDetails(user.id);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      platformAdmin: user.role === "admin",
      erpRole: user.erpRole,
      erpActive: user.erpActive,
      scopes,
      canProvision: isProvisioningAdmin(ctx),
    };
  }),

  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const user = requireCtpAccount(ctx);
    const db = await requireDatabase();
    const scopes = await getActiveScopes(user.id);
    requireSomeScopes(scopes);
    const filter = scopedFilter(productionEntries, scopes);
    const entries = await db.select().from(productionEntries).where(filter).orderBy(desc(productionEntries.createdAt)).limit(100);
    const producedRows = entries.filter((row) => row.qtyProduced !== null);
    const conformingRows = entries.filter((row) => row.qtyConforming !== null);
    const totalProduced = producedRows.length ? producedRows.reduce((sum, row) => sum + row.qtyProduced!, 0) : null;
    const totalConforming = conformingRows.length ? conformingRows.reduce((sum, row) => sum + row.qtyConforming!, 0) : null;
    const approved = entries.filter((row) => row.workflowStatus === "approved").length;
    const pending = entries.filter((row) => row.workflowStatus === "awaiting_manager" || row.workflowStatus === "awaiting_controller").length;
    const scopeDetails = await listScopeDetails(user.id);
    const openTickets = await db.select({ id: maintenanceTickets.id }).from(maintenanceTickets).where(or(...scopes.map((scope) => and(
      eq(maintenanceTickets.teamId, scope.teamId),
      eq(maintenanceTickets.machineId, scope.machineId),
      eq(maintenanceTickets.status, "open"),
    ))));
    return {
      totalProduced,
      producedKnownEntries: producedRows.length,
      totalConforming,
      conformingKnownEntries: conformingRows.length,
      approved,
      pending,
      openMaintenance: openTickets.length,
      machines: scopeDetails,
      recentEntries: entries.slice(0, 5),
      synthetic: false,
    };
  }),

  scopes: protectedProcedure.query(async ({ ctx }) => {
    const user = requireCtpAccount(ctx);
    return listScopeDetails(user.id);
  }),

  stationConfig: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const canManage = isProvisioningAdmin(ctx);
      const user = canManage ? ctx.user! : requireCtpAccount(ctx, ["resp_production"]);
      const db = await requireDatabase();
      const filters = [eq(machines.material, "EVA" as const), eq(machines.active, true)];
      if (!canManage) {
        const scopes = await getActiveScopes(user.id);
        requireSomeScopes(scopes);
        const machineIds = [...new Set(scopes.map((scope) => scope.machineId))];
        filters.push(inArray(machines.id, machineIds));
      }
      return db.select({
        machineId: machineStations.machineId,
        machineCode: machines.code,
        machineName: machines.name,
        stationNumber: machineStations.stationNumber,
        active: machineStations.active,
        productionMode: machineStations.productionMode,
        mould1Active: machineStations.mould1Active,
        mould2Active: machineStations.mould2Active,
      }).from(machineStations)
        .innerJoin(machines, eq(machineStations.machineId, machines.id))
        .where(and(...filters))
        .orderBy(machines.code, machineStations.stationNumber);
    }),
    set: protectedProcedure.input(z.object({
      machineId: z.number().int().positive(),
      stationNumber: z.number().int().min(1).max(6),
      active: z.boolean(),
      productionMode: z.enum(["1_couleur", "bicolor", "inactif"]),
      mould1Active: z.boolean(),
      mould2Active: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const actor = requireProvisioningAdmin(ctx);
      const db = await requireDatabase();
      const [machine] = await db.select().from(machines).where(and(
        eq(machines.id, input.machineId),
        eq(machines.material, "EVA"),
        eq(machines.active, true),
      )).limit(1);
      if (!machine || input.stationNumber > machine.stationCount) throw new TRPCError({ code: "BAD_REQUEST", message: "Machine EVA ou station inactive/inconnue." });
      await db.transaction(async (tx) => {
        await tx.insert(machineStations).values(input).onDuplicateKeyUpdate({ set: {
          active: input.active,
          productionMode: input.productionMode,
          mould1Active: input.mould1Active,
          mould2Active: input.mould2Active,
        } });
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "machine_station", entityId: `${input.machineId}:${input.stationNumber}`, action: "configuration_updated", actorId: actor.id, details: { active: input.active, productionMode: input.productionMode, mould1Active: input.mould1Active, mould2Active: input.mould2Active } });
      });
      return { success: true };
    }),
  }),

  production: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const user = requireCtpAccount(ctx);
      const db = await requireDatabase();
      const scopes = await getActiveScopes(user.id);
      requireSomeScopes(scopes);
      const filter = scopedFilter(productionEntries, scopes);
      return db.select().from(productionEntries).where(filter).orderBy(desc(productionEntries.createdAt)).limit(100);
    }),

    createDraft: protectedProcedure.input(productionInput).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, ["chef_equipe", "operateur", "resp_production"]);
      await assertScope(user.id, input.teamId, input.machineId);
      const db = await requireDatabase();
      const [machine] = await db.select().from(machines).where(eq(machines.id, input.machineId)).limit(1);
      if (!machine || !machine.active) throw new TRPCError({ code: "NOT_FOUND", message: "Machine inactive ou inconnue." });
      if (input.stationNumber > machine.stationCount) throw new TRPCError({ code: "BAD_REQUEST", message: `La machine comporte ${machine.stationCount} stations physiques.` });
      if (machine.material === "EVA") {
        const [station] = await db.select({ active: machineStations.active, productionMode: machineStations.productionMode, mould1Active: machineStations.mould1Active, mould2Active: machineStations.mould2Active }).from(machineStations).where(and(
          eq(machineStations.machineId, input.machineId),
          eq(machineStations.stationNumber, input.stationNumber),
        )).limit(1);
        if (!isEvaStationAvailable(station)) throw new TRPCError({ code: "BAD_REQUEST", message: "Station EVA non configurée ou inactive (mode arrêté, station arrêtée ou aucun moule actif)." });
      }
      if (input.material !== machine.material) throw new TRPCError({ code: "BAD_REQUEST", message: "La matière ne correspond pas au type de machine sélectionné." });
      const [model] = await db.select({ id: modelMaster.id }).from(modelMaster).where(and(
        eq(modelMaster.active, true),
        eq(modelMaster.modelName, input.modelName),
        eq(modelMaster.material, input.material),
        eq(modelMaster.sizeRange, input.sizeRange),
      )).limit(1);
      const modelRecognition = model ? "validated" : "new_model";
      const evaluation = evaluateProductionLine({
        fullCartons: input.fullCartons,
        openCartons: input.openCartons,
        loosePairs: input.loosePairs,
        pairsPerCarton: input.pairsPerCarton,
        qtyProduced: input.qtyProduced,
        qtyConforming: input.qtyConforming,
        qtyRejected: input.qtyRejected,
        counterStart: input.counterStart,
        counterEnd: input.counterEnd,
        modelRecognition,
      });
      const id = randomUUID();
      await db.transaction(async (tx) => {
      await tx.insert(productionEntries).values({
        id,
        productionDate: input.productionDate,
        shift: input.shift,
        teamId: input.teamId,
        machineId: input.machineId,
        stationNumber: input.stationNumber,
        material: input.material,
        modelName: input.modelName,
        modelRecognition,
        sizeRange: input.sizeRange,
        color1: input.color1 ?? null,
        color2: input.color2 ?? null,
        counterStart: input.counterStart ?? null,
        counterEnd: input.counterEnd ?? null,
        qtyProduced: input.qtyProduced ?? null,
        qtyConforming: input.qtyConforming ?? null,
        qtyRejected: input.qtyRejected ?? null,
        qtySecondChoice: input.qtySecondChoice ?? null,
        fullCartons: input.fullCartons ?? null,
        openCartons: input.openCartons ?? null,
        loosePairs: input.loosePairs ?? null,
        pairsPerCarton: input.pairsPerCarton ?? null,
        materialConsumedKg: input.materialConsumedKg == null ? null : input.materialConsumedKg.toFixed(2),
        downtimeMinutes: input.downtimeMinutes ?? null,
        downtimeReason: input.downtimeReason ?? null,
        notes: input.notes ?? null,
        workflowStatus: "draft",
        createdBy: user.id,
      });
      await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "production_entry", entityId: id, action: "draft_created", actorId: user.id, details: { teamId: input.teamId, machineId: input.machineId, modelRecognition } });
      });
      return { id, modelRecognition, evaluation };
    }),

    transition: protectedProcedure.input(z.object({
      id: z.string().uuid(),
      action: z.enum(["submit", "gerant_confirm", "gerant_return", "final_approve", "final_return"]),
      note: z.string().trim().max(1000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx);
      const db = await requireDatabase();
      return db.transaction(async (tx) => {
        const [entry] = await tx.select().from(productionEntries).where(eq(productionEntries.id, input.id)).for("update").limit(1);
        if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Fiche de production introuvable." });
        await assertScope(user.id, entry.teamId, entry.machineId);
        const note = input.note?.trim() ?? "";
        const fail = (code: "FORBIDDEN" | "CONFLICT" | "BAD_REQUEST", message: string) => { throw new TRPCError({ code, message }); };
        let nextStatus = entry.workflowStatus;
        let patch: Partial<typeof productionEntries.$inferInsert> = {};
        switch (input.action) {
          case "submit":
            if (user.erpRole !== "chef_equipe") fail("FORBIDDEN", "Seul le Chef d’équipe affecté peut soumettre la fiche.");
            if (entry.workflowStatus !== "draft" && entry.workflowStatus !== "returned") fail("CONFLICT", "Seule une fiche en brouillon ou retournée peut être soumise.");
            if (entry.qtyProduced != null && entry.qtyConforming != null && entry.qtyRejected != null && entry.qtyConforming + entry.qtyRejected !== entry.qtyProduced) fail("BAD_REQUEST", "La fiche présente un conflit entre conformes, rebuts et total.");
            nextStatus = "awaiting_manager";
            patch = { submittedBy: user.id, managerConfirmedBy: null, finalApprovedBy: null, returnReason: null };
            break;
          case "gerant_confirm":
          case "gerant_return":
            if (user.erpRole !== "gerant") fail("FORBIDDEN", "Seul un Gérant affecté peut examiner la fiche.");
            if (entry.workflowStatus !== "awaiting_manager") fail("CONFLICT", "La fiche n’attend pas la revue du Gérant.");
            if (entry.submittedBy === user.id) fail("FORBIDDEN", "L’émetteur ne peut pas valider sa propre fiche.");
            if (input.action === "gerant_return" && !note) fail("BAD_REQUEST", "Le motif de retour est obligatoire.");
            nextStatus = input.action === "gerant_confirm" ? "awaiting_controller" : "returned";
            patch = input.action === "gerant_confirm" ? { managerConfirmedBy: user.id, returnReason: null } : { returnReason: note };
            break;
          case "final_approve":
          case "final_return":
            if (user.erpRole !== "amin_final_approver") fail("FORBIDDEN", "Seul le rôle Amin approbateur final affecté peut effectuer cette étape.");
            if (entry.workflowStatus !== "awaiting_controller") fail("CONFLICT", "La fiche n’attend pas l’approbation finale.");
            if (entry.submittedBy === user.id || entry.managerConfirmedBy === user.id) fail("FORBIDDEN", "Les approbateurs précédents ne peuvent pas donner l’approbation finale.");
            if (input.action === "final_return" && !note) fail("BAD_REQUEST", "Le motif de retour est obligatoire.");
            nextStatus = input.action === "final_approve" ? "approved" : "returned";
            patch = input.action === "final_approve" ? { finalApprovedBy: user.id, returnReason: null } : { returnReason: note };
            break;
        }
        await tx.update(productionEntries).set({ ...patch, workflowStatus: nextStatus }).where(eq(productionEntries.id, entry.id));
        await tx.insert(workflowEvents).values({ id: randomUUID(), productionEntryId: entry.id, action: input.action, actorId: user.id, note: note || null });
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "production_entry", entityId: entry.id, action: input.action, actorId: user.id, details: note ? { note } : null });
        return { id: entry.id, workflowStatus: nextStatus };
      });
    }),
  }),

  cartons: router({
    listOpen: protectedProcedure.query(async ({ ctx }) => {
      const user = requireCtpAccount(ctx);
      const db = await requireDatabase();
      const scopes = await getActiveScopes(user.id);
      requireSomeScopes(scopes);
      const filter = scopedFilter(cartons, scopes);
      return db.select().from(cartons).where(and(eq(cartons.status, "open"), filter)).orderBy(desc(cartons.createdAt)).limit(100);
    }),

    applyFlow: protectedProcedure.input(z.object({
      flowDate: dateInput,
      stepNumber: z.number().int().min(1).max(3),
      modelName: z.string().trim().min(1).max(120),
      sizeRange: z.string().trim().min(1).max(32),
      colorName: z.string().trim().min(1).max(48),
      teamId: z.number().int().positive(),
      machineId: z.number().int().positive(),
      stationNumber: z.number().int().min(1).max(6),
      declaredCartons: z.number().int().min(1).max(500),
      pairsPerCarton: z.number().int().min(1).max(100).optional(),
      notes: z.string().trim().max(1000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, ["chef_equipe", "operateur", "resp_production"]);
      await assertScope(user.id, input.teamId, input.machineId);
      const db = await requireDatabase();
      const [machine] = await db.select().from(machines).where(eq(machines.id, input.machineId)).limit(1);
      if (!machine || !machine.active || input.stationNumber > machine.stationCount) throw new TRPCError({ code: "BAD_REQUEST", message: "Poste/station invalide pour cette machine." });
      if (machine.material === "EVA") {
        const [station] = await db.select({ active: machineStations.active, productionMode: machineStations.productionMode, mould1Active: machineStations.mould1Active, mould2Active: machineStations.mould2Active }).from(machineStations).where(and(
          eq(machineStations.machineId, input.machineId),
          eq(machineStations.stationNumber, input.stationNumber),
        )).limit(1);
        if (!isEvaStationAvailable(station)) throw new TRPCError({ code: "BAD_REQUEST", message: "Station EVA non configurée ou inactive (mode arrêté, station arrêtée ou aucun moule actif)." });
      }
      const [model] = await db.select().from(modelMaster).where(and(
        eq(modelMaster.active, true),
        eq(modelMaster.modelName, input.modelName),
        eq(modelMaster.material, machine.material),
        eq(modelMaster.sizeRange, input.sizeRange),
      )).limit(1);
      const pairsPerCarton = model?.pairsPerCarton ?? input.pairsPerCarton;
      if (!pairsPerCarton) throw new TRPCError({ code: "BAD_REQUEST", message: "Modèle inconnu : renseignez une quantité par carton; la clôture restera bloquée jusqu’à validation du référentiel." });
      const userScopes = await getActiveScopes(user.id);
      const scopeKeys = new Set(userScopes.map((scope) => `${scope.teamId}:${scope.machineId}`));
      const id = randomUUID();
      const result = await db.transaction(async (tx) => {
        const expectedPreviousStep = input.stepNumber - 1;
        const candidates = await tx.select().from(cartons).where(and(
          eq(cartons.status, "open"),
          eq(cartons.modelName, input.modelName),
          eq(cartons.sizeRange, input.sizeRange),
          eq(cartons.currentStep, expectedPreviousStep),
        )).orderBy(cartons.createdAt).for("update").limit(1000);
        const eligible = candidates.filter((carton) => scopeKeys.has(`${carton.teamId}:${carton.machineId}`));
        const counts = calculateCartonFlowCounts(input.stepNumber as 1 | 2 | 3, eligible.length, input.declaredCartons);
        const affected: string[] = [];
        for (const carton of eligible.slice(0, counts.recoveredCartons)) {
          const patch: Partial<typeof cartons.$inferInsert> = {
            currentStep: input.stepNumber,
            teamId: input.teamId,
            machineId: input.machineId,
            stationNumber: input.stationNumber,
            lastActorId: user.id,
          };
          if (input.stepNumber === 1) patch.color1 = input.colorName;
          if (input.stepNumber === 2) patch.color2 = input.colorName;
          if (input.stepNumber === 3) patch.color3 = input.colorName;
          await tx.update(cartons).set(patch).where(eq(cartons.id, carton.id));
          affected.push(carton.id);
        }
        const boxPrefix = `CTP-${input.modelName.replace(/[^A-Za-z0-9]/g, "").slice(0, 18).toUpperCase()}-${input.sizeRange.replace(/[^A-Za-z0-9]/g, "")}`;
        const newRows = Array.from({ length: counts.newCartons }, () => {
          const cartonId = `${boxPrefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
          affected.push(cartonId);
          const progress = initializeNewCartonProgress(input.colorName);
          return {
            id: cartonId,
            modelName: input.modelName,
            sizeRange: input.sizeRange,
            teamId: input.teamId,
            machineId: input.machineId,
            stationNumber: input.stationNumber,
            pairsPerCarton,
            currentPairs: pairsPerCarton,
            currentStep: progress.currentStep,
            requiredSteps: 3,
            color1: progress.color1,
            color2: progress.color2,
            color3: progress.color3,
            status: "open" as const,
            qualityValidated: false,
            configurationValidated: Boolean(model),
            createdBy: user.id,
            lastActorId: user.id,
          };
        });
        if (newRows.length) await tx.insert(cartons).values(newRows);
        await tx.insert(cartonFlowOperations).values({
          id,
          flowDate: input.flowDate,
          stepNumber: input.stepNumber,
          modelName: input.modelName,
          sizeRange: input.sizeRange,
          colorName: input.colorName,
          teamId: input.teamId,
          machineId: input.machineId,
          stationNumber: input.stationNumber,
          declaredCartons: input.declaredCartons,
          recoveredCartons: counts.recoveredCartons,
          newCartons: counts.newCartons,
          completedCartons: counts.completedCartons,
          remainingOpenCartons: counts.remainingOpenCartons,
          affectedCartonIds: affected,
          notes: input.notes ?? null,
          actorId: user.id,
        });
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "carton_flow", entityId: id, action: "step_applied", actorId: user.id, details: { stepNumber: input.stepNumber, affectedCartonCount: affected.length } });
        return { operationId: id, ...counts, affectedCartonIds: affected, configurationValidated: Boolean(model) };
      });
      return result;
    }),

    close: protectedProcedure.input(idInput).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, ["chef_equipe", "operateur", "resp_production"]);
      const db = await requireDatabase();
      return db.transaction(async (tx) => {
        const [carton] = await tx.select().from(cartons).where(eq(cartons.id, input.id)).for("update").limit(1);
        if (!carton) throw new TRPCError({ code: "NOT_FOUND", message: "Carton introuvable." });
        await assertScope(user.id, carton.teamId, carton.machineId);
        if (carton.status !== "open") throw new TRPCError({ code: "CONFLICT", message: "Le carton n’est plus ouvert." });
        const validation = evaluateCartonClosure({
          currentStep: carton.currentStep,
          requiredSteps: carton.requiredSteps,
          currentPairs: carton.currentPairs,
          pairsPerCarton: carton.pairsPerCarton,
          stageColors: [carton.color1, carton.color2, carton.color3],
          modelAndSizeValidated: carton.configurationValidated,
          qualityValidated: carton.qualityValidated,
          authorizedOperatorConfirmed: true,
        });
        if (!validation.canClose) throw new TRPCError({ code: "PRECONDITION_FAILED", message: validation.blockReasons.join(" ") });
        await tx.update(cartons).set({ status: "closed", closedBy: user.id, closedAt: new Date(), lastActorId: user.id }).where(eq(cartons.id, carton.id));
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "carton", entityId: carton.id, action: "closed", actorId: user.id, details: null });
        return { id: carton.id, status: "closed" as const };
      });
    }),
  }),

  quality: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const user = requireCtpAccount(ctx, ["resp_qualite", "resp_production", "chef_equipe", "operateur", "gerant"]);
      const db = await requireDatabase();
      const scopes = await getActiveScopes(user.id);
      requireSomeScopes(scopes);
      const filter = scopedFilter(qualityRecords, scopes);
      return db.select().from(qualityRecords).where(filter).orderBy(desc(qualityRecords.createdAt)).limit(100);
    }),
    record: protectedProcedure.input(z.object({
      productionEntryId: z.string().uuid().optional(),
      cartonId: z.string().min(1).max(96).optional(),
      teamId: z.number().int().positive(),
      machineId: z.number().int().positive(),
      result: z.enum(["pending", "approved", "rejected", "reserve"]),
      notes: z.string().trim().max(1000).optional(),
    }).refine((value) => Boolean(value.productionEntryId || value.cartonId), "Une fiche ou un carton est requis.")).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, ["resp_qualite"]);
      await assertScope(user.id, input.teamId, input.machineId);
      const db = await requireDatabase();
      const id = randomUUID();
      await db.transaction(async (tx) => {
        if (input.cartonId) {
          const [carton] = await tx.select().from(cartons).where(eq(cartons.id, input.cartonId)).for("update").limit(1);
          if (!carton || carton.teamId !== input.teamId || carton.machineId !== input.machineId) throw new TRPCError({ code: "FORBIDDEN", message: "Carton hors du couple d’affectation fourni." });
          if (carton.currentStep < carton.requiredSteps) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le carton n’a pas terminé les étapes prévues." });
          await tx.update(cartons).set({ qualityValidated: input.result === "approved" }).where(eq(cartons.id, carton.id));
        }
        if (input.productionEntryId) {
          const [entry] = await tx.select().from(productionEntries).where(eq(productionEntries.id, input.productionEntryId)).limit(1);
          if (!entry || entry.teamId !== input.teamId || entry.machineId !== input.machineId) throw new TRPCError({ code: "FORBIDDEN", message: "Fiche hors du couple d’affectation fourni." });
        }
        await tx.insert(qualityRecords).values({ id, productionEntryId: input.productionEntryId ?? null, cartonId: input.cartonId ?? null, teamId: input.teamId, machineId: input.machineId, result: input.result, notes: input.notes ?? null, inspectorId: user.id });
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "quality_record", entityId: id, action: input.result, actorId: user.id, details: { productionEntryId: input.productionEntryId ?? null, cartonId: input.cartonId ?? null } });
      });
      return { id, result: input.result };
    }),
  }),

  stock: router({
    listItems: protectedProcedure.query(async ({ ctx }) => {
      const user = requireCtpAccount(ctx, ["resp_stock"]);
      requireSomeScopes(await getActiveScopes(user.id));
      const db = await requireDatabase();
      return db.select().from(inventoryItems).where(eq(inventoryItems.active, true)).orderBy(inventoryItems.name).limit(300);
    }),
    createItem: protectedProcedure.input(z.object({
      sku: z.string().trim().min(1).max(48),
      name: z.string().trim().min(1).max(140),
      category: z.string().trim().min(1).max(48),
      unit: z.string().trim().min(1).max(16),
      quantity: z.number().min(0).max(10000000),
      lowStockThreshold: z.number().min(0).max(10000000).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, ["resp_stock"]);
      requireSomeScopes(await getActiveScopes(user.id));
      const db = await requireDatabase();
      const id = await db.transaction(async (tx) => {
        const result = await tx.insert(inventoryItems).values({
          sku: input.sku,
          name: input.name,
          category: input.category,
          unit: input.unit,
          quantity: input.quantity.toFixed(2),
          lowStockThreshold: input.lowStockThreshold == null ? null : input.lowStockThreshold.toFixed(2),
        });
        const itemId = Number(result[0].insertId);
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "inventory_item", entityId: String(itemId), action: "created", actorId: user.id, details: { sku: input.sku } });
        return itemId;
      });
      return { id };
    }),
    move: protectedProcedure.input(z.object({
      itemId: z.number().int().positive(),
      movementType: z.enum(["in", "out", "adjustment"]),
      quantity: z.number().positive().max(10000000),
      reference: z.string().trim().max(96).optional(),
      notes: z.string().trim().max(1000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, ["resp_stock"]);
      requireSomeScopes(await getActiveScopes(user.id));
      const db = await requireDatabase();
      await db.transaction(async (tx) => {
        const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.itemId)).for("update").limit(1);
        if (!item || !item.active) throw new TRPCError({ code: "NOT_FOUND", message: "Article de stock introuvable." });
        const current = Number(item.quantity);
        const signed = input.movementType === "in" ? input.quantity : input.movementType === "out" ? -input.quantity : input.quantity - current;
        const next = Number((current + signed).toFixed(2));
        if (next < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Le mouvement rendrait le stock négatif." });
        await tx.update(inventoryItems).set({ quantity: next.toFixed(2) }).where(eq(inventoryItems.id, input.itemId));
        await tx.insert(inventoryMovements).values({
          id: randomUUID(),
          itemId: input.itemId,
          movementType: input.movementType,
          quantity: Math.abs(signed).toFixed(2),
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          actorId: user.id,
        });
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "inventory_item", entityId: String(input.itemId), action: "stock_moved", actorId: user.id, details: { movementType: input.movementType, signedQuantity: signed } });
      });
      return { success: true };
    }),
  }),

  maintenance: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const user = requireCtpAccount(ctx, ["resp_maintenance", "resp_production", "gerant", "chef_equipe", "operateur"]);
      const db = await requireDatabase();
      const scopes = await getActiveScopes(user.id);
      requireSomeScopes(scopes);
      const filter = scopedFilter(maintenanceTickets, scopes);
      return db.select().from(maintenanceTickets).where(filter).orderBy(desc(maintenanceTickets.createdAt)).limit(100);
    }),
    create: protectedProcedure.input(z.object({
      teamId: z.number().int().positive(),
      machineId: z.number().int().positive(),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(2000).optional(),
      priority: z.enum(["low", "normal", "high", "critical"]),
    })).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, ["resp_maintenance", "resp_production", "chef_equipe", "operateur"]);
      await assertScope(user.id, input.teamId, input.machineId);
      const db = await requireDatabase();
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(maintenanceTickets).values({ id, teamId: input.teamId, machineId: input.machineId, title: input.title, description: input.description ?? null, priority: input.priority, status: "open", reporterId: user.id });
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "maintenance_ticket", entityId: id, action: "created", actorId: user.id, details: { teamId: input.teamId, machineId: input.machineId } });
      });
      return { id };
    }),
    setStatus: protectedProcedure.input(z.object({ id: z.string().uuid(), status: z.enum(["in_progress", "resolved"]) })).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, ["resp_maintenance"]);
      const db = await requireDatabase();
      return db.transaction(async (tx) => {
        const [ticket] = await tx.select().from(maintenanceTickets).where(eq(maintenanceTickets.id, input.id)).for("update").limit(1);
        if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
        await assertScope(user.id, ticket.teamId, ticket.machineId);
        await tx.update(maintenanceTickets).set({ status: input.status, resolvedAt: input.status === "resolved" ? new Date() : null }).where(eq(maintenanceTickets.id, ticket.id));
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "maintenance_ticket", entityId: ticket.id, action: "status_changed", actorId: user.id, details: { status: input.status } });
        return { id: ticket.id, status: input.status };
      });
    }),
  }),

  business: router({
    list: protectedProcedure.input(z.object({ module: z.enum(["hr", "commercial", "finance", "reference"]) })).query(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, moduleRoles[input.module]);
      const db = await requireDatabase();
      const scopes = await getActiveScopes(user.id);
      requireSomeScopes(scopes);
      const filter = scopedFilter(businessRecords, scopes);
      return db.select().from(businessRecords).where(and(eq(businessRecords.module, input.module), filter)).orderBy(desc(businessRecords.createdAt)).limit(100);
    }),
    create: protectedProcedure.input(z.object({
      module: z.enum(["hr", "commercial", "finance", "reference"]),
      recordType: z.string().trim().min(1).max(48),
      title: z.string().trim().min(1).max(160),
      payload: z.record(z.string(), z.unknown()),
      teamId: z.number().int().positive(),
      machineId: z.number().int().positive(),
    })).mutation(async ({ ctx, input }) => {
      const user = requireCtpAccount(ctx, moduleRoles[input.module]);
      await assertScope(user.id, input.teamId, input.machineId);
      if (JSON.stringify(input.payload).length > 10000) throw new TRPCError({ code: "BAD_REQUEST", message: "Le contenu dépasse la taille maximale." });
      const db = await requireDatabase();
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(businessRecords).values({ id, module: input.module, recordType: input.recordType, title: input.title, payload: input.payload, teamId: input.teamId, machineId: input.machineId, actorId: user.id });
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: `${input.module}_record`, entityId: id, action: "created", actorId: user.id, details: { recordType: input.recordType } });
      });
      return { id };
    }),
  }),

  models: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      requireCtpAccount(ctx, ["admin_general", "resp_production", "chef_equipe", "operateur", "resp_qualite"]);
      const db = await requireDatabase();
      return db.select().from(modelMaster).where(eq(modelMaster.active, true)).orderBy(modelMaster.modelName).limit(500);
    }),
    create: protectedProcedure.input(z.object({
      modelCode: z.string().trim().min(1).max(48),
      modelName: z.string().trim().min(1).max(120),
      material: z.enum(["EVA", "SOUMELLE", "PVC"]),
      sizeRange: z.string().trim().min(1).max(32),
      pairsPerCarton: z.number().int().min(1).max(100),
    })).mutation(async ({ ctx, input }) => {
      const actor = requireProvisioningAdmin(ctx);
      const db = await requireDatabase();
      const id = await db.transaction(async (tx) => {
        const result = await tx.insert(modelMaster).values({ ...input, createdBy: actor.id });
        const modelId = Number(result[0].insertId);
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "model_master", entityId: String(modelId), action: "created", actorId: actor.id, details: { modelCode: input.modelCode, material: input.material, sizeRange: input.sizeRange } });
        return modelId;
      });
      return { id };
    }),
  }),

  admin: router({
    setupReferences: protectedProcedure.mutation(async ({ ctx }) => {
      const actor = requireProvisioningAdmin(ctx);
      const db = await requireDatabase();
      const teamDefinitions = ["A", "B", "C"].map((code) => ({ code, name: `Équipe ${code}` }));
      const machineDefinitions = [
        { code: "EVA1", name: "EVA 1", material: "EVA" as const },
        { code: "EVA2", name: "EVA 2", material: "EVA" as const },
        { code: "EVA3", name: "EVA 3", material: "EVA" as const },
        { code: "EVA4", name: "EVA 4", material: "EVA" as const },
        { code: "PVC1", name: "PVC 1", material: "PVC" as const },
        { code: "SOU1", name: "SOUMELLE 1", material: "SOUMELLE" as const },
      ];
      let createdTeams = 0;
      let createdMachines = 0;
      let preservedMachines = 0;
      await db.transaction(async (tx) => {
        for (const definition of teamDefinitions) {
          const [existing] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.code, definition.code)).limit(1);
          if (!existing) { await tx.insert(teams).values(definition); createdTeams += 1; }
        }
        for (const definition of machineDefinitions) {
          const [existing] = await tx.select({ id: machines.id, stationCount: machines.stationCount }).from(machines).where(eq(machines.code, definition.code)).limit(1);
          let machineId: number;
          let stationCount = 6;
          if (!existing) {
            const [inserted] = await tx.insert(machines).values({ ...definition, stationCount: 6, moldsPerStation: 2, status: "idle", active: true });
            machineId = Number(inserted.insertId);
            createdMachines += 1;
          } else {
            machineId = existing.id;
            stationCount = existing.stationCount;
            preservedMachines += 1;
          }
          if (definition.material === "EVA") {
            for (let stationNumber = 1; stationNumber <= Math.min(6, stationCount); stationNumber += 1) {
              const [configured] = await tx.select({ id: machineStations.id }).from(machineStations).where(and(
                eq(machineStations.machineId, machineId),
                eq(machineStations.stationNumber, stationNumber),
              )).limit(1);
              if (!configured) await tx.insert(machineStations).values({ machineId, stationNumber, active: true, productionMode: "1_couleur", mould1Active: true, mould2Active: true });
            }
          }
        }
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "reference_setup", entityId: randomUUID(), action: "initialized_if_missing", actorId: actor.id, details: { createdTeams, createdMachines } });
      });
      return { createdTeams, createdMachines, preservedMachines };
    }),
    directory: protectedProcedure.query(async ({ ctx }) => {
      requireProvisioningAdmin(ctx);
      const db = await requireDatabase();
      const [allUsers, allTeams, allMachines, allScopes] = await Promise.all([
        db.select({ id: users.id, name: users.name, email: users.email, role: users.erpRole, active: users.erpActive, platformAdmin: users.role }).from(users).orderBy(users.name).limit(300),
        db.select().from(teams).orderBy(teams.code),
        db.select().from(machines).orderBy(machines.code),
        db.select().from(userMachineScopes).where(eq(userMachineScopes.active, true)),
      ]);
      return { users: allUsers, teams: allTeams, machines: allMachines, scopes: allScopes };
    }),
    assignUser: protectedProcedure.input(z.object({
      userId: z.number().int().positive(),
      erpRole: z.enum(ERP_ROLES).nullable(),
      active: z.boolean(),
      scopes: z.array(z.object({ teamId: z.number().int().positive(), machineId: z.number().int().positive() })).max(100),
    }).refine((value) => value.erpRole !== null || !value.active, "Un utilisateur sans rôle ERP ne peut pas être actif.")).mutation(async ({ ctx, input }) => {
      const actor = requireProvisioningAdmin(ctx);
      const db = await requireDatabase();
      const unique = new Set(input.scopes.map((scope) => `${scope.teamId}:${scope.machineId}`));
      if (unique.size !== input.scopes.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Couple équipe–machine en double." });
      await db.transaction(async (tx) => {
        const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Compte Manus non trouvé." });
        await tx.update(users).set({ erpRole: input.erpRole, erpActive: input.active }).where(eq(users.id, input.userId));
        await tx.update(userMachineScopes).set({ active: false }).where(eq(userMachineScopes.userId, input.userId));
        for (const scope of input.scopes) {
          const [team] = await tx.select({ id: teams.id }).from(teams).where(and(eq(teams.id, scope.teamId), eq(teams.active, true))).limit(1);
          const [machine] = await tx.select({ id: machines.id }).from(machines).where(and(eq(machines.id, scope.machineId), eq(machines.active, true))).limit(1);
          if (!team || !machine) throw new TRPCError({ code: "BAD_REQUEST", message: "Équipe ou machine inactive/inconnue." });
          const [existing] = await tx.select({ id: userMachineScopes.id }).from(userMachineScopes).where(and(
            eq(userMachineScopes.userId, input.userId),
            eq(userMachineScopes.teamId, scope.teamId),
            eq(userMachineScopes.machineId, scope.machineId),
          )).limit(1);
          if (existing) {
            await tx.update(userMachineScopes).set({ active: true }).where(eq(userMachineScopes.id, existing.id));
          } else {
            await tx.insert(userMachineScopes).values({ userId: input.userId, teamId: scope.teamId, machineId: scope.machineId, active: true, createdBy: actor.id });
          }
        }
        await tx.insert(auditLogs).values({ id: randomUUID(), entityType: "user_assignment", entityId: String(input.userId), action: "role_and_scopes_assigned", actorId: actor.id, details: { erpRole: input.erpRole, active: input.active, scopeCount: input.scopes.length } });
      });
      return { success: true };
    }),
  }),
});
