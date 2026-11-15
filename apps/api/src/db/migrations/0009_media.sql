CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer,
	`role` text NOT NULL,
	`kind` text NOT NULL,
	`dir` text NOT NULL,
	`size_bytes` integer,
	`duration_sec` real,
	`status` text DEFAULT 'pending' NOT NULL,
	`delete_after` integer,
	`created_at` integer NOT NULL,
	`ready_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_dir_uq` ON `media` (`dir`);--> statement-breakpoint
CREATE INDEX `media_task_idx` ON `media` (`task_id`);--> statement-breakpoint
CREATE INDEX `media_status_delete_after_idx` ON `media` (`status`,`delete_after`);--> statement-breakpoint
CREATE TABLE `media_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_id` integer NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_media_path_uq` ON `media_files` (`media_id`,`path`);