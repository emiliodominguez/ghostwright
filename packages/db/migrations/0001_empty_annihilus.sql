ALTER TABLE `baseline` ADD `name` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `step_result` ADD `baseline_key` text;--> statement-breakpoint
ALTER TABLE `step_result` ADD `diff_key` text;--> statement-breakpoint
ALTER TABLE `step_result` ADD `diff_pct` real;