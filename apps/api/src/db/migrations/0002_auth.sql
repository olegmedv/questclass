CREATE TABLE `login_throttle` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`last_failure_at` integer NOT NULL,
	`locked_until` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`device_id` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`device_id`) REFERENCES `trusted_devices`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_uq` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_device_idx` ON `sessions` (`device_id`);--> statement-breakpoint
CREATE TABLE `trusted_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	`revoked_by` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trusted_devices_token_hash_uq` ON `trusted_devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`login` text,
	`avatar` text,
	`password_hash` text,
	`pin_hash` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deactivated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_uq` ON `users` (`login`);--> statement-breakpoint
CREATE INDEX `users_role_active_idx` ON `users` (`role`,`active`);