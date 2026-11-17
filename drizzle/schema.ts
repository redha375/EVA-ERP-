import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core identity table. Manus OAuth owns openId; ERP roles and scopes are assigned
 * separately by a trusted project administrator and are never accepted from a client.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  erpRole: varchar("erpRole", { length: 40 }),
  erpActive: boolean("erpActive").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const oauthStates = mysqlTable("oauth_states", {
  stateHash: varchar("state_hash", { length: 64 }).primaryKey(),
  platform: mysqlEnum("platform", ["web", "native"]).notNull(),
  redirectUri: varchar("redirect_uri", { length: 1024 }).notNull(),
  nonceHash: varchar("nonce_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("oauth_states_expiry_idx").on(table.expiresAt)]);

export const teams = mysqlTable("ctp_teams", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 16 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("ctp_teams_code_uq").on(table.code)]);

export const machines = mysqlTable("ctp_machines", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 24 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  material: mysqlEnum("material", ["EVA", "SOUMELLE", "PVC"]).notNull(),
  stationCount: int("station_count").default(6).notNull(),
  moldsPerStation: int("molds_per_station").default(2).notNull(),
  status: mysqlEnum("status", ["running", "idle", "breakdown", "maintenance", "stopped"]).default("idle").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("ctp_machines_code_uq").on(table.code)]);

export const machineStations = mysqlTable("ctp_machine_stations", {
  id: int("id").autoincrement().primaryKey(),
  machineId: int("machine_id").notNull().references(() => machines.id),
  stationNumber: int("station_number").notNull(),
  active: boolean("active").default(true).notNull(),
  productionMode: mysqlEnum("production_mode", ["1_couleur", "bicolor", "inactif"]).default("1_couleur").notNull(),
  mould1Active: boolean("mould_1_active").default(true).notNull(),
  mould2Active: boolean("mould_2_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("ctp_machine_station_uq").on(table.machineId, table.stationNumber),
  index("ctp_machine_station_machine_idx").on(table.machineId),
]);

export const modelMaster = mysqlTable("ctp_model_master", {
  id: int("id").autoincrement().primaryKey(),
  modelCode: varchar("model_code", { length: 48 }).notNull(),
  modelName: varchar("model_name", { length: 120 }).notNull(),
  material: mysqlEnum("material", ["EVA", "SOUMELLE", "PVC"]).notNull(),
  sizeRange: varchar("size_range", { length: 32 }).notNull(),
  pairsPerCarton: int("pairs_per_carton").notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: int("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("ctp_model_code_size_uq").on(table.modelCode, table.material, table.sizeRange),
  index("ctp_model_name_idx").on(table.modelName, table.material, table.sizeRange),
]);

export const userMachineScopes = mysqlTable("ctp_user_machine_scopes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id),
  teamId: int("team_id").notNull().references(() => teams.id),
  machineId: int("machine_id").notNull().references(() => machines.id),
  active: boolean("active").default(true).notNull(),
  createdBy: int("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("ctp_scope_pair_uq").on(table.userId, table.teamId, table.machineId),
  index("ctp_scope_user_idx").on(table.userId),
]);

export const productionEntries = mysqlTable("ctp_production_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  productionDate: varchar("production_date", { length: 10 }).notNull(),
  shift: mysqlEnum("shift", ["matin", "soir", "nuit"]).notNull(),
  teamId: int("team_id").notNull().references(() => teams.id),
  machineId: int("machine_id").notNull().references(() => machines.id),
  stationNumber: int("station_number").notNull(),
  material: mysqlEnum("material", ["EVA", "SOUMELLE", "PVC"]).notNull(),
  modelName: varchar("model_name", { length: 120 }).notNull(),
  modelRecognition: mysqlEnum("model_recognition", ["validated", "needs_review", "new_model"]).default("new_model").notNull(),
  sizeRange: varchar("size_range", { length: 32 }).notNull(),
  color1: varchar("color_1", { length: 48 }),
  color2: varchar("color_2", { length: 48 }),
  counterStart: int("counter_start"),
  counterEnd: int("counter_end"),
  qtyProduced: int("qty_produced"),
  qtyConforming: int("qty_conforming"),
  qtyRejected: int("qty_rejected"),
  qtySecondChoice: int("qty_second_choice"),
  fullCartons: int("full_cartons"),
  openCartons: int("open_cartons"),
  loosePairs: int("loose_pairs"),
  pairsPerCarton: int("pairs_per_carton"),
  materialConsumedKg: decimal("material_consumed_kg", { precision: 10, scale: 2 }),
  downtimeMinutes: int("downtime_minutes"),
  downtimeReason: text("downtime_reason"),
  notes: text("notes"),
  workflowStatus: mysqlEnum("workflow_status", ["draft", "awaiting_manager", "awaiting_controller", "returned", "approved"]).default("draft").notNull(),
  submittedBy: int("submitted_by").references(() => users.id),
  managerConfirmedBy: int("manager_confirmed_by").references(() => users.id),
  finalApprovedBy: int("final_approved_by").references(() => users.id),
  returnReason: text("return_reason"),
  createdBy: int("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("ctp_prod_scope_date_idx").on(table.teamId, table.machineId, table.productionDate),
  index("ctp_prod_status_idx").on(table.workflowStatus),
]);

export const workflowEvents = mysqlTable("ctp_workflow_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  productionEntryId: varchar("production_entry_id", { length: 36 }).notNull().references(() => productionEntries.id),
  action: mysqlEnum("action", ["submit", "gerant_confirm", "gerant_return", "final_approve", "final_return"]).notNull(),
  actorId: int("actor_id").notNull().references(() => users.id),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("ctp_workflow_entry_idx").on(table.productionEntryId, table.createdAt)]);

export const cartons = mysqlTable("ctp_cartons", {
  id: varchar("id_carton", { length: 96 }).primaryKey(),
  modelName: varchar("model_name", { length: 120 }).notNull(),
  sizeRange: varchar("size_range", { length: 32 }).notNull(),
  teamId: int("team_id").notNull().references(() => teams.id),
  machineId: int("machine_id").notNull().references(() => machines.id),
  stationNumber: int("station_number").notNull(),
  pairsPerCarton: int("pairs_per_carton").default(12).notNull(),
  currentPairs: int("current_pairs").default(0).notNull(),
  currentStep: int("current_step").default(0).notNull(),
  requiredSteps: int("required_steps").default(3).notNull(),
  color1: varchar("color_1", { length: 48 }),
  color2: varchar("color_2", { length: 48 }),
  color3: varchar("color_3", { length: 48 }),
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  qualityValidated: boolean("quality_validated").default(false).notNull(),
  configurationValidated: boolean("configuration_validated").default(false).notNull(),
  createdBy: int("created_by").notNull().references(() => users.id),
  lastActorId: int("last_actor_id").notNull().references(() => users.id),
  closedBy: int("closed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
}, (table) => [
  index("ctp_carton_model_size_idx").on(table.modelName, table.sizeRange, table.status),
  index("ctp_carton_scope_idx").on(table.teamId, table.machineId, table.status),
]);

export const cartonFlowOperations = mysqlTable("ctp_carton_flow_operations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  flowDate: varchar("flow_date", { length: 10 }).notNull(),
  stepNumber: int("step_number").notNull(),
  modelName: varchar("model_name", { length: 120 }).notNull(),
  sizeRange: varchar("size_range", { length: 32 }).notNull(),
  colorName: varchar("color_name", { length: 48 }).notNull(),
  teamId: int("team_id").notNull().references(() => teams.id),
  machineId: int("machine_id").notNull().references(() => machines.id),
  stationNumber: int("station_number").notNull(),
  declaredCartons: int("declared_cartons").notNull(),
  recoveredCartons: int("recovered_cartons").notNull(),
  newCartons: int("new_cartons").notNull(),
  completedCartons: int("completed_cartons").notNull(),
  remainingOpenCartons: int("remaining_open_cartons").notNull(),
  affectedCartonIds: json("affected_carton_ids").$type<string[]>().notNull(),
  notes: text("notes"),
  actorId: int("actor_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("ctp_flow_scope_date_idx").on(table.teamId, table.machineId, table.flowDate)]);

export const qualityRecords = mysqlTable("ctp_quality_records", {
  id: varchar("id", { length: 36 }).primaryKey(),
  productionEntryId: varchar("production_entry_id", { length: 36 }).references(() => productionEntries.id),
  cartonId: varchar("carton_id", { length: 96 }).references(() => cartons.id),
  teamId: int("team_id").notNull().references(() => teams.id),
  machineId: int("machine_id").notNull().references(() => machines.id),
  result: mysqlEnum("result", ["pending", "approved", "rejected", "reserve"]).default("pending").notNull(),
  notes: text("notes"),
  inspectorId: int("inspector_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inventoryItems = mysqlTable("ctp_inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  sku: varchar("sku", { length: 48 }).notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  category: varchar("category", { length: 48 }).notNull(),
  unit: varchar("unit", { length: 16 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).default("0").notNull(),
  lowStockThreshold: decimal("low_stock_threshold", { precision: 12, scale: 2 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("ctp_inventory_sku_uq").on(table.sku)]);

export const inventoryMovements = mysqlTable("ctp_inventory_movements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  itemId: int("item_id").notNull().references(() => inventoryItems.id),
  movementType: mysqlEnum("movement_type", ["in", "out", "adjustment"]).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  reference: varchar("reference", { length: 96 }),
  notes: text("notes"),
  actorId: int("actor_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("ctp_inventory_movement_item_idx").on(table.itemId, table.createdAt)]);

export const maintenanceTickets = mysqlTable("ctp_maintenance_tickets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: int("team_id").notNull().references(() => teams.id),
  machineId: int("machine_id").notNull().references(() => machines.id),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "normal", "high", "critical"]).default("normal").notNull(),
  status: mysqlEnum("status", ["open", "in_progress", "resolved"]).default("open").notNull(),
  reporterId: int("reporter_id").notNull().references(() => users.id),
  assignedTo: int("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [index("ctp_maintenance_scope_status_idx").on(table.teamId, table.machineId, table.status)]);

/**
 * Typed domain envelope for HR, commercial, finance and reference records while
 * keeping the JSON payload server-validated and scoped through the API.
 */
export const businessRecords = mysqlTable("ctp_business_records", {
  id: varchar("id", { length: 36 }).primaryKey(),
  module: mysqlEnum("module", ["hr", "commercial", "finance", "reference"]).notNull(),
  recordType: varchar("record_type", { length: 48 }).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  teamId: int("team_id").references(() => teams.id),
  machineId: int("machine_id").references(() => machines.id),
  actorId: int("actor_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("ctp_business_module_date_idx").on(table.module, table.createdAt)]);

export const auditLogs = mysqlTable("ctp_audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  entityType: varchar("entity_type", { length: 48 }).notNull(),
  entityId: varchar("entity_id", { length: 96 }).notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  actorId: int("actor_id").notNull().references(() => users.id),
  details: json("details").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("ctp_audit_entity_idx").on(table.entityType, table.entityId, table.createdAt)]);
