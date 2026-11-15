CREATE TABLE `watch_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`intervals` text NOT NULL,
	`watched_sec` real DEFAULT 0 NOT NULL,
	`percent` integer DEFAULT 0 NOT NULL,
	`last_position` real DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`confirmed_by` integer,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`confirmed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watch_progress_learner_task_media_uq` ON `watch_progress` (`learner_id`,`task_id`,`media_id`);--> statement-breakpoint
CREATE TABLE `watch_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`last_batch_at` integer NOT NULL,
	`credited_sec` real DEFAULT 0 NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `watch_sessions_learner_task_idx` ON `watch_sessions` (`learner_id`,`task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `watch_sessions_one_open_uq` ON `watch_sessions` (`learner_id`,`task_id`) WHERE closed_at IS NULL;