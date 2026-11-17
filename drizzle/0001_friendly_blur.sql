CREATE TABLE `ctp_audit_logs` (
	`id` varchar(36) NOT NULL,
	`entity_type` varchar(48) NOT NULL,
	`entity_id` varchar(96) NOT NULL,
	`action` varchar(48) NOT NULL,
	`actor_id` int NOT NULL,
	`details` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ctp_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ctp_business_records` (
	`id` varchar(36) NOT NULL,
	`module` enum('hr','commercial','finance','reference') NOT NULL,
	`record_type` varchar(48) NOT NULL,
	`title` varchar(160) NOT NULL,
	`payload` json NOT NULL,
	`team_id` int,
	`machine_id` int,
	`actor_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ctp_business_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ctp_carton_flow_operations` (
	`id` varchar(36) NOT NULL,
	`flow_date` varchar(10) NOT NULL,
	`step_number` int NOT NULL,
	`model_name` varchar(120) NOT NULL,
	`size_range` varchar(32) NOT NULL,
	`color_name` varchar(48) NOT NULL,
	`team_id` int NOT NULL,
	`machine_id` int NOT NULL,
	`station_number` int NOT NULL,
	`declared_cartons` int NOT NULL,
	`recovered_cartons` int NOT NULL,
	`new_cartons` int NOT NULL,
	`completed_cartons` int NOT NULL,
	`remaining_open_cartons` int NOT NULL,
	`affected_carton_ids` json NOT NULL,
	`notes` text,
	`actor_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ctp_carton_flow_operations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ctp_cartons` (
	`id_carton` varchar(96) NOT NULL,
	`model_name` varchar(120) NOT NULL,
	`size_range` varchar(32) NOT NULL,
	`team_id` int NOT NULL,
	`machine_id` int NOT NULL,
	`station_number` int NOT NULL,
	`pairs_per_carton` int NOT NULL DEFAULT 12,
	`current_pairs` int NOT NULL DEFAULT 0,
	`current_step` int NOT NULL DEFAULT 0,
	`required_steps` int NOT NULL DEFAULT 3,
	`color_1` varchar(48),
	`color_2` varchar(48),
	`color_3` varchar(48),
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`quality_validated` boolean NOT NULL DEFAULT false,
	`configuration_validated` boolean NOT NULL DEFAULT false,
	`created_by` int NOT NULL,
	`last_actor_id` int NOT NULL,
	`closed_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`closed_at` timestamp,
	CONSTRAINT `ctp_cartons_id_carton` PRIMARY KEY(`id_carton`)
);
--> statement-breakpoint
CREATE TABLE `ctp_inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(48) NOT NULL,
	`name` varchar(140) NOT NULL,
	`category` varchar(48) NOT NULL,
	`unit` varchar(16) NOT NULL,
	`quantity` decimal(12,2) NOT NULL DEFAULT '0',
	`low_stock_threshold` decimal(12,2),
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ctp_inventory_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `ctp_inventory_sku_uq` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `ctp_inventory_movements` (
	`id` varchar(36) NOT NULL,
	`item_id` int NOT NULL,
	`movement_type` enum('in','out','adjustment') NOT NULL,
	`quantity` decimal(12,2) NOT NULL,
	`reference` varchar(96),
	`notes` text,
	`actor_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ctp_inventory_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ctp_machine_stations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`machine_id` int NOT NULL,
	`station_number` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`production_mode` enum('1_couleur','bicolor','inactif') NOT NULL DEFAULT '1_couleur',
	`mould_1_active` boolean NOT NULL DEFAULT true,
	`mould_2_active` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ctp_machine_stations_id` PRIMARY KEY(`id`),
	CONSTRAINT `ctp_machine_station_uq` UNIQUE(`machine_id`,`station_number`)
);
--> statement-breakpoint
CREATE TABLE `ctp_machines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`material` enum('EVA','SOUMELLE','PVC') NOT NULL,
	`station_count` int NOT NULL DEFAULT 6,
	`molds_per_station` int NOT NULL DEFAULT 2,
	`status` enum('running','idle','breakdown','maintenance','stopped') NOT NULL DEFAULT 'idle',
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ctp_machines_id` PRIMARY KEY(`id`),
	CONSTRAINT `ctp_machines_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `ctp_maintenance_tickets` (
	`id` varchar(36) NOT NULL,
	`team_id` int NOT NULL,
	`machine_id` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` text,
	`priority` enum('low','normal','high','critical') NOT NULL DEFAULT 'normal',
	`status` enum('open','in_progress','resolved') NOT NULL DEFAULT 'open',
	`reporter_id` int NOT NULL,
	`assigned_to` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`resolved_at` timestamp,
	CONSTRAINT `ctp_maintenance_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ctp_model_master` (
	`id` int AUTO_INCREMENT NOT NULL,
	`model_code` varchar(48) NOT NULL,
	`model_name` varchar(120) NOT NULL,
	`material` enum('EVA','SOUMELLE','PVC') NOT NULL,
	`size_range` varchar(32) NOT NULL,
	`pairs_per_carton` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ctp_model_master_id` PRIMARY KEY(`id`),
	CONSTRAINT `ctp_model_code_size_uq` UNIQUE(`model_code`,`material`,`size_range`)
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state_hash` varchar(64) NOT NULL,
	`platform` enum('web','native') NOT NULL,
	`redirect_uri` varchar(1024) NOT NULL,
	`nonce_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `oauth_states_state_hash` PRIMARY KEY(`state_hash`)
);
--> statement-breakpoint
CREATE TABLE `ctp_production_entries` (
	`id` varchar(36) NOT NULL,
	`production_date` varchar(10) NOT NULL,
	`shift` enum('matin','soir','nuit') NOT NULL,
	`team_id` int NOT NULL,
	`machine_id` int NOT NULL,
	`station_number` int NOT NULL,
	`material` enum('EVA','SOUMELLE','PVC') NOT NULL,
	`model_name` varchar(120) NOT NULL,
	`model_recognition` enum('validated','needs_review','new_model') NOT NULL DEFAULT 'new_model',
	`size_range` varchar(32) NOT NULL,
	`color_1` varchar(48),
	`color_2` varchar(48),
	`counter_start` int,
	`counter_end` int,
	`qty_produced` int,
	`qty_conforming` int,
	`qty_rejected` int,
	`qty_second_choice` int,
	`full_cartons` int,
	`open_cartons` int,
	`loose_pairs` int,
	`pairs_per_carton` int,
	`material_consumed_kg` decimal(10,2),
	`downtime_minutes` int,
	`downtime_reason` text,
	`notes` text,
	`workflow_status` enum('draft','awaiting_manager','awaiting_controller','returned','approved') NOT NULL DEFAULT 'draft',
	`submitted_by` int,
	`manager_confirmed_by` int,
	`final_approved_by` int,
	`return_reason` text,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ctp_production_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ctp_quality_records` (
	`id` varchar(36) NOT NULL,
	`production_entry_id` varchar(36),
	`carton_id` varchar(96),
	`team_id` int NOT NULL,
	`machine_id` int NOT NULL,
	`result` enum('pending','approved','rejected','reserve') NOT NULL DEFAULT 'pending',
	`notes` text,
	`inspector_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ctp_quality_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ctp_teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`name` varchar(120) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ctp_teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `ctp_teams_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `ctp_user_machine_scopes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`team_id` int NOT NULL,
	`machine_id` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ctp_user_machine_scopes_id` PRIMARY KEY(`id`),
	CONSTRAINT `ctp_scope_pair_uq` UNIQUE(`user_id`,`team_id`,`machine_id`)
);
--> statement-breakpoint
CREATE TABLE `ctp_workflow_events` (
	`id` varchar(36) NOT NULL,
	`production_entry_id` varchar(36) NOT NULL,
	`action` enum('submit','gerant_confirm','gerant_return','final_approve','final_return') NOT NULL,
	`actor_id` int NOT NULL,
	`note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ctp_workflow_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `erpRole` varchar(40);--> statement-breakpoint
ALTER TABLE `users` ADD `erpActive` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ctp_audit_logs` ADD CONSTRAINT `ctp_audit_logs_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_business_records` ADD CONSTRAINT `ctp_business_records_team_id_ctp_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `ctp_teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_business_records` ADD CONSTRAINT `ctp_business_records_machine_id_ctp_machines_id_fk` FOREIGN KEY (`machine_id`) REFERENCES `ctp_machines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_business_records` ADD CONSTRAINT `ctp_business_records_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_carton_flow_operations` ADD CONSTRAINT `ctp_carton_flow_operations_team_id_ctp_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `ctp_teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_carton_flow_operations` ADD CONSTRAINT `ctp_carton_flow_operations_machine_id_ctp_machines_id_fk` FOREIGN KEY (`machine_id`) REFERENCES `ctp_machines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_carton_flow_operations` ADD CONSTRAINT `ctp_carton_flow_operations_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_cartons` ADD CONSTRAINT `ctp_cartons_team_id_ctp_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `ctp_teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_cartons` ADD CONSTRAINT `ctp_cartons_machine_id_ctp_machines_id_fk` FOREIGN KEY (`machine_id`) REFERENCES `ctp_machines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_cartons` ADD CONSTRAINT `ctp_cartons_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_cartons` ADD CONSTRAINT `ctp_cartons_last_actor_id_users_id_fk` FOREIGN KEY (`last_actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_cartons` ADD CONSTRAINT `ctp_cartons_closed_by_users_id_fk` FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_inventory_movements` ADD CONSTRAINT `ctp_inventory_movements_item_id_ctp_inventory_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `ctp_inventory_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_inventory_movements` ADD CONSTRAINT `ctp_inventory_movements_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_machine_stations` ADD CONSTRAINT `ctp_machine_stations_machine_id_ctp_machines_id_fk` FOREIGN KEY (`machine_id`) REFERENCES `ctp_machines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_maintenance_tickets` ADD CONSTRAINT `ctp_maintenance_tickets_team_id_ctp_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `ctp_teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_maintenance_tickets` ADD CONSTRAINT `ctp_maintenance_tickets_machine_id_ctp_machines_id_fk` FOREIGN KEY (`machine_id`) REFERENCES `ctp_machines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_maintenance_tickets` ADD CONSTRAINT `ctp_maintenance_tickets_reporter_id_users_id_fk` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_maintenance_tickets` ADD CONSTRAINT `ctp_maintenance_tickets_assigned_to_users_id_fk` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_model_master` ADD CONSTRAINT `ctp_model_master_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_production_entries` ADD CONSTRAINT `ctp_production_entries_team_id_ctp_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `ctp_teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_production_entries` ADD CONSTRAINT `ctp_production_entries_machine_id_ctp_machines_id_fk` FOREIGN KEY (`machine_id`) REFERENCES `ctp_machines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_production_entries` ADD CONSTRAINT `ctp_production_entries_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_production_entries` ADD CONSTRAINT `ctp_production_entries_manager_confirmed_by_users_id_fk` FOREIGN KEY (`manager_confirmed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_production_entries` ADD CONSTRAINT `ctp_production_entries_final_approved_by_users_id_fk` FOREIGN KEY (`final_approved_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_production_entries` ADD CONSTRAINT `ctp_production_entries_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_quality_records` ADD CONSTRAINT `ctp_quality_entry_fk` FOREIGN KEY (`production_entry_id`) REFERENCES `ctp_production_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_quality_records` ADD CONSTRAINT `ctp_quality_records_carton_id_ctp_cartons_id_carton_fk` FOREIGN KEY (`carton_id`) REFERENCES `ctp_cartons`(`id_carton`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_quality_records` ADD CONSTRAINT `ctp_quality_records_team_id_ctp_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `ctp_teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_quality_records` ADD CONSTRAINT `ctp_quality_records_machine_id_ctp_machines_id_fk` FOREIGN KEY (`machine_id`) REFERENCES `ctp_machines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_quality_records` ADD CONSTRAINT `ctp_quality_records_inspector_id_users_id_fk` FOREIGN KEY (`inspector_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_user_machine_scopes` ADD CONSTRAINT `ctp_user_machine_scopes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_user_machine_scopes` ADD CONSTRAINT `ctp_user_machine_scopes_team_id_ctp_teams_id_fk` FOREIGN KEY (`team_id`) REFERENCES `ctp_teams`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_user_machine_scopes` ADD CONSTRAINT `ctp_user_machine_scopes_machine_id_ctp_machines_id_fk` FOREIGN KEY (`machine_id`) REFERENCES `ctp_machines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_user_machine_scopes` ADD CONSTRAINT `ctp_user_machine_scopes_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_workflow_events` ADD CONSTRAINT `ctp_workflow_entry_fk` FOREIGN KEY (`production_entry_id`) REFERENCES `ctp_production_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ctp_workflow_events` ADD CONSTRAINT `ctp_workflow_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ctp_audit_entity_idx` ON `ctp_audit_logs` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ctp_business_module_date_idx` ON `ctp_business_records` (`module`,`created_at`);--> statement-breakpoint
CREATE INDEX `ctp_flow_scope_date_idx` ON `ctp_carton_flow_operations` (`team_id`,`machine_id`,`flow_date`);--> statement-breakpoint
CREATE INDEX `ctp_carton_model_size_idx` ON `ctp_cartons` (`model_name`,`size_range`,`status`);--> statement-breakpoint
CREATE INDEX `ctp_carton_scope_idx` ON `ctp_cartons` (`team_id`,`machine_id`,`status`);--> statement-breakpoint
CREATE INDEX `ctp_inventory_movement_item_idx` ON `ctp_inventory_movements` (`item_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ctp_machine_station_machine_idx` ON `ctp_machine_stations` (`machine_id`);--> statement-breakpoint
CREATE INDEX `ctp_maintenance_scope_status_idx` ON `ctp_maintenance_tickets` (`team_id`,`machine_id`,`status`);--> statement-breakpoint
CREATE INDEX `ctp_model_name_idx` ON `ctp_model_master` (`model_name`,`material`,`size_range`);--> statement-breakpoint
CREATE INDEX `oauth_states_expiry_idx` ON `oauth_states` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ctp_prod_scope_date_idx` ON `ctp_production_entries` (`team_id`,`machine_id`,`production_date`);--> statement-breakpoint
CREATE INDEX `ctp_prod_status_idx` ON `ctp_production_entries` (`workflow_status`);--> statement-breakpoint
CREATE INDEX `ctp_scope_user_idx` ON `ctp_user_machine_scopes` (`user_id`);--> statement-breakpoint
CREATE INDEX `ctp_workflow_entry_idx` ON `ctp_workflow_events` (`production_entry_id`,`created_at`);
