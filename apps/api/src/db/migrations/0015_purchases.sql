CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`item_version` integer NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`price` integer NOT NULL,
	`visual_key` text,
	`reward_type` text,
	`reward_amount` integer,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_learner_request_uq` ON `purchases` (`learner_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `purchases_learner_item_idx` ON `purchases` (`learner_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `purchases_item_idx` ON `purchases` (`item_id`);