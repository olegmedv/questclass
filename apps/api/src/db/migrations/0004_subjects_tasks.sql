CREATE TABLE `task_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`learner_id` integer NOT NULL,
	`position` integer NOT NULL,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_assignments_task_learner_uq` ON `task_assignments` (`task_id`,`learner_id`);--> statement-breakpoint
CREATE INDEX `task_assignments_learner_position_idx` ON `task_assignments` (`learner_id`,`position`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`icon` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_key_uq` ON `subjects` (`key`);--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_name_key_uq` ON `subjects` (`name_key`);--> statement-breakpoint
CREATE INDEX `subjects_sort_idx` ON `subjects` (`sort`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`subject_id` integer,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`config` text NOT NULL,
	`xp` integer NOT NULL,
	`coins` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`release_at` integer,
	`lesson_date` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`external_id` text,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tasks_subject_sort_idx` ON `tasks` (`subject_id`,`sort`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_external_id_uq` ON `tasks` (`external_id`);