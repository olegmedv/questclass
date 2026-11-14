CREATE TABLE `streak_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`day_key` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `streak_days_learner_day_uq` ON `streak_days` (`learner_id`,`day_key`);