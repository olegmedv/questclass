CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`result` text,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_runs_one_running_uq` ON `job_runs` (`job`) WHERE finished_at IS NULL;--> statement-breakpoint
CREATE INDEX `job_runs_job_started_idx` ON `job_runs` (`job`,`started_at`);