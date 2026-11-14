CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`key` text NOT NULL,
	`version` integer NOT NULL,
	`text` text NOT NULL,
	`options` text NOT NULL,
	`correct` text NOT NULL,
	`image_ref` text,
	`evidence` text,
	`state` text DEFAULT 'active' NOT NULL,
	`source` text NOT NULL,
	`position` integer NOT NULL,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`archived_at` integer,
	`archived_by` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`archived_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_task_key_version_uq` ON `questions` (`task_id`,`key`,`version`);--> statement-breakpoint
CREATE INDEX `questions_task_live_idx` ON `questions` (`task_id`,`archived_at`,`state`);--> statement-breakpoint
CREATE TABLE `transcripts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`media_id` integer,
	`lang` text NOT NULL,
	`source` text NOT NULL,
	`segments` text NOT NULL,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `transcripts_task_idx` ON `transcripts` (`task_id`,`created_at`);