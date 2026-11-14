CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`learner_id` integer,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_learner_at_idx` ON `audit_log` (`learner_id`,`at`);