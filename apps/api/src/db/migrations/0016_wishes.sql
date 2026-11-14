CREATE TABLE `fulfillment_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fulfillment_id` integer NOT NULL,
	`purchase_id` integer NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`fulfillment_id`) REFERENCES `fulfillments`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fulfillment_allocations_uq` ON `fulfillment_allocations` (`fulfillment_id`,`purchase_id`);--> statement-breakpoint
CREATE INDEX `fulfillment_allocations_purchase_idx` ON `fulfillment_allocations` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `fulfillments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`group_key` text NOT NULL,
	`request_id` text NOT NULL,
	`reward_type` text NOT NULL,
	`title` text NOT NULL,
	`amount` integer NOT NULL,
	`created_by` integer,
	`at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fulfillments_learner_request_uq` ON `fulfillments` (`learner_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `fulfillments_learner_group_idx` ON `fulfillments` (`learner_id`,`group_key`,`at`);--> statement-breakpoint
CREATE TABLE `wish_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`learner_id` integer NOT NULL,
	`group_key` text NOT NULL,
	`at` integer NOT NULL,
	FOREIGN KEY (`learner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `wish_requests_learner_group_idx` ON `wish_requests` (`learner_id`,`group_key`,`at`);