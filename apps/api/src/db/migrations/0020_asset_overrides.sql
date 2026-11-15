CREATE TABLE `asset_overrides` (
	`slot` text PRIMARY KEY NOT NULL,
	`upload_id` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` integer,
	FOREIGN KEY (`upload_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
