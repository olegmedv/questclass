CREATE TABLE `awards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`request_id` text NOT NULL,
	`reason_id` integer,
	`reason_name` text NOT NULL,
	`title` text NOT NULL,
	`title_key` text NOT NULL,
	`date` text NOT NULL,
	`subject_id` integer,
	`subject_name` text NOT NULL,
	`task_id` integer,
	`xp` integer NOT NULL,
	`coins` integer NOT NULL,
	`note` text,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reason_id`) REFERENCES `reward_reasons`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `awards_learner_request_uq` ON `awards` (`learner_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `awards_learner_date_idx` ON `awards` (`learner_id`,`date`);--> statement-breakpoint
CREATE TABLE `reward_reasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`seed_key` text,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`xp` integer NOT NULL,
	`coins` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_reasons_seed_key_uq` ON `reward_reasons` (`seed_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `reward_reasons_active_name_uq` ON `reward_reasons` (`name_key`) WHERE archived_at IS NULL;