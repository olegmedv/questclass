CREATE TABLE `chore_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`period_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`note` text,
	`reward_xp` integer,
	`reward_coins` integer,
	`reviewed_by` integer,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chore_completions_live_uq` ON `chore_completions` (`learner_id`,`task_id`,`period_key`) WHERE status IN ('pending', 'approved');--> statement-breakpoint
CREATE INDEX `chore_completions_status_idx` ON `chore_completions` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `chore_completions_learner_task_idx` ON `chore_completions` (`learner_id`,`task_id`);