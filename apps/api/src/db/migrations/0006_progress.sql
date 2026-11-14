CREATE TABLE `task_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`epoch` integer NOT NULL,
	`state` text NOT NULL,
	`score` integer,
	`total` integer,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`closed_by` integer,
	`closed_reason` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`closed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_progress_learner_task_epoch_uq` ON `task_progress` (`learner_id`,`task_id`,`epoch`);--> statement-breakpoint
CREATE INDEX `task_progress_task_idx` ON `task_progress` (`task_id`);--> statement-breakpoint
CREATE TABLE `progress_resets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`task_id` integer,
	`kind` text DEFAULT 'reset' NOT NULL,
	`request_id` text,
	`at` integer NOT NULL,
	`by` integer,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `progress_resets_learner_idx` ON `progress_resets` (`learner_id`,`task_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `progress_resets_request_uq` ON `progress_resets` (`learner_id`,`request_id`);