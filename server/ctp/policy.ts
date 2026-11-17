import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, machines, teams, userMachineScopes } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db";

export const ERP_ROLES = [
  "admin_general",
  "direction",
  "resp_production",
  "gerant",
  "chef_equipe",
  "resp_qualite",
  "resp_maintenance",
  "resp_stock",
  "resp_commercial",
  "rh",
  "operateur",
  "controleur_production",
  "amin_final_approver",
] as const;
export type ErpRole = (typeof ERP_ROLES)[number];

export type ScopePair = { teamId: number; machineId: number };

export async function requireDatabase() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "La base de données est indisponible." });
  }
  return db;
}

export function requireCtpAccount(ctx: TrpcContext, allowedRoles?: readonly ErpRole[]) {
  const user = ctx.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Connexion Manus requise." });
  if (!user.erpActive || !user.erpRole || !ERP_ROLES.includes(user.erpRole as ErpRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Compte CTP non activé : demandez une affectation à l’administrateur ERP." });
  }
  const role = user.erpRole as ErpRole;
  if (allowedRoles && !allowedRoles.includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Ce rôle ne peut pas effectuer cette action." });
  }
  return { ...user, erpRole: role };
}

export function isProvisioningAdmin(ctx: TrpcContext): boolean {
  return Boolean(ctx.user && (ctx.user.role === "admin" || (ctx.user.erpActive && ctx.user.erpRole === "admin_general")));
}

export function requireProvisioningAdmin(ctx: TrpcContext) {
  if (!isProvisioningAdmin(ctx)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seul l’administrateur de projet ou un Admin CTP actif peut gérer les affectations." });
  }
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Connexion Manus requise." });
  return ctx.user;
}

export async function getActiveScopes(userId: number): Promise<ScopePair[]> {
  const db = await requireDatabase();
  const rows = await db
    .select({ teamId: userMachineScopes.teamId, machineId: userMachineScopes.machineId })
    .from(userMachineScopes)
    .where(and(eq(userMachineScopes.userId, userId), eq(userMachineScopes.active, true)));
  return rows;
}

export async function assertScope(userId: number, teamId: number, machineId: number): Promise<void> {
  const db = await requireDatabase();
  const [match] = await db
    .select({ id: userMachineScopes.id })
    .from(userMachineScopes)
    .where(and(
      eq(userMachineScopes.userId, userId),
      eq(userMachineScopes.teamId, teamId),
      eq(userMachineScopes.machineId, machineId),
      eq(userMachineScopes.active, true),
    ))
    .limit(1);
  if (!match) throw new TRPCError({ code: "FORBIDDEN", message: "Couple équipe–machine hors de votre affectation." });
}

export async function listScopeDetails(userId: number) {
  const db = await requireDatabase();
  return db
    .select({
      teamId: userMachineScopes.teamId,
      teamCode: teams.code,
      teamName: teams.name,
      machineId: userMachineScopes.machineId,
      machineCode: machines.code,
      machineName: machines.name,
      material: machines.material,
      machineStatus: machines.status,
      stationCount: machines.stationCount,
      moldsPerStation: machines.moldsPerStation,
    })
    .from(userMachineScopes)
    .innerJoin(teams, eq(userMachineScopes.teamId, teams.id))
    .innerJoin(machines, eq(userMachineScopes.machineId, machines.id))
    .where(and(eq(userMachineScopes.userId, userId), eq(userMachineScopes.active, true)));
}

export async function writeAudit(
  actorId: number,
  entityType: string,
  entityId: string,
  action: string,
  details: Record<string, unknown> | null = null,
) {
  const db = await requireDatabase();
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId,
    entityType,
    entityId,
    action,
    details,
  });
}
