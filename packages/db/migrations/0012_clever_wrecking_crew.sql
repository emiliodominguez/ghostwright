CREATE TABLE `capture_run` (
	`id` text PRIMARY KEY NOT NULL,
	`login_flow_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`cookie_count` integer,
	`trace_key` text,
	`video_key` text,
	`screenshot_key` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`login_flow_id`) REFERENCES `login_flow`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `capture_step` (
	`id` text PRIMARY KEY NOT NULL,
	`capture_run_id` text NOT NULL,
	`idx` integer NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`duration_ms` integer,
	`screenshot_key` text,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`capture_run_id`) REFERENCES `capture_run`(`id`) ON UPDATE no action ON DELETE no action
);
