CREATE TABLE `import_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_by` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_tokens_token_hash_uq` ON `import_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `task_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`media_id` integer,
	`images_media_id` integer,
	`questions` text NOT NULL,
	`token_id` integer,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	`decided_by` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`images_media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`token_id`) REFERENCES `import_tokens`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `task_revisions_status_idx` ON `task_revisions` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_revisions_one_pending_uq` ON `task_revisions` (`task_id`) WHERE status = 'pending';