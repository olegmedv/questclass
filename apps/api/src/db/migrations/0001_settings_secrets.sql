CREATE TABLE `secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer
);
