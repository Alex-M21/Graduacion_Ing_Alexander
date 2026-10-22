CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`encrypted_value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `guests` ADD `drive_synced_at` text;