CREATE TABLE `animations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`src` text,
	`motion` text,
	`poster` text NOT NULL,
	`poster_sprite` text,
	`duration_ms` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `animations_key_uq` ON `animations` (`key`);--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`seed_key` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price` integer NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`starter` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`character_id` integer,
	`room_id` integer,
	`animation_id` integer,
	`image` text,
	`sprite` text,
	`image_upload_id` integer,
	`animation_upload_id` integer,
	`room_category` text,
	`reward_type` text,
	`reward_amount` integer,
	`edited_fields` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`animation_id`) REFERENCES `animations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`image_upload_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`animation_upload_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_items_seed_key_uq` ON `catalog_items` (`seed_key`);--> statement-breakpoint
CREATE INDEX `catalog_items_kind_active_idx` ON `catalog_items` (`kind`,`active`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`image` text NOT NULL,
	`sprite` text,
	`foot_offset` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_key_uq` ON `characters` (`key`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`image` text NOT NULL,
	`thumb` text NOT NULL,
	`foot_x` real NOT NULL,
	`foot_y` real NOT NULL,
	`scene` text NOT NULL,
	`scene_assets` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_key_uq` ON `rooms` (`key`);