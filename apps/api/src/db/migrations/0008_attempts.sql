CREATE TABLE `attempt_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attempt_id` integer NOT NULL,
	`attempt_question_id` integer NOT NULL,
	`option_id` text NOT NULL,
	`correct` integer NOT NULL,
	`answered_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`attempt_question_id`) REFERENCES `attempt_questions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_answers_question_uq` ON `attempt_answers` (`attempt_question_id`);--> statement-breakpoint
CREATE TABLE `attempt_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attempt_id` integer NOT NULL,
	`position` integer NOT NULL,
	`question_id` integer NOT NULL,
	`question_key` text NOT NULL,
	`question_version` integer NOT NULL,
	`text` text NOT NULL,
	`options` text NOT NULL,
	`correct` text NOT NULL,
	`image_ref` text,
	`evidence` text,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_questions_attempt_position_uq` ON `attempt_questions` (`attempt_id`,`position`);--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`epoch` integer NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`total` integer NOT NULL,
	`correct` integer,
	`passed` integer,
	`reward_xp` integer DEFAULT 0 NOT NULL,
	`reward_coins` integer DEFAULT 0 NOT NULL,
	`streak_xp` integer DEFAULT 0 NOT NULL,
	`streak_coins` integer DEFAULT 0 NOT NULL,
	`retry_grant_id` integer,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`retry_grant_id`) REFERENCES `retry_grants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `attempts_learner_task_epoch_idx` ON `attempts` (`learner_id`,`task_id`,`epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_one_open_uq` ON `attempts` (`learner_id`,`task_id`) WHERE status = 'in_progress';--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_retry_grant_uq` ON `attempts` (`retry_grant_id`);--> statement-breakpoint
CREATE TABLE `retry_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`epoch` integer NOT NULL,
	`granted_by` integer,
	`granted_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `retry_grants_learner_task_idx` ON `retry_grants` (`learner_id`,`task_id`,`epoch`);--> statement-breakpoint
CREATE TABLE `retry_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`epoch` integer NOT NULL,
	`attempt_id` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` integer,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `retry_requests_one_open_uq` ON `retry_requests` (`learner_id`,`task_id`) WHERE status = 'open';--> statement-breakpoint
CREATE INDEX `retry_requests_status_idx` ON `retry_requests` (`status`,`created_at`);