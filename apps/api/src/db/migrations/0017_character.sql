CREATE TABLE `learner_characters` (
	`learner_id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`look_item_id` integer,
	`room_item_id` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`look_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`room_item_id`) REFERENCES `catalog_items`(`id`) ON UPDATE no action ON DELETE restrict
);
