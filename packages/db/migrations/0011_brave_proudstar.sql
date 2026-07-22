ALTER TABLE `login_flow` ADD `last_captured_at` integer;--> statement-breakpoint
ALTER TABLE `login_flow` ADD `last_capture_error` text;--> statement-breakpoint
ALTER TABLE `login_flow` ADD `cookie_count` integer;