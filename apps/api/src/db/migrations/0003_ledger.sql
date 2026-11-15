CREATE TABLE `ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`at` integer NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`coins` integer DEFAULT 0 NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`idem_key` text NOT NULL,
	`reverses_id` integer,
	`note` text,
	`created_by` integer,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reverses_id`) REFERENCES `ledger`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_idem_key_uq` ON `ledger` (`idem_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_reverses_id_uq` ON `ledger` (`reverses_id`);--> statement-breakpoint
CREATE INDEX `ledger_learner_at_idx` ON `ledger` (`learner_id`,`at`);--> statement-breakpoint
CREATE INDEX `ledger_source_idx` ON `ledger` (`source_type`,`source_id`);