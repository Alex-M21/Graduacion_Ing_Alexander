CREATE TABLE `__new_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `guests`(`user_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_photos`("id", "user_id", "object_key", "content_type", "bytes", "created_at") SELECT "id", "user_id", "object_key", "content_type", "bytes", "created_at" FROM `photos`;--> statement-breakpoint
DROP TABLE `photos`;--> statement-breakpoint
ALTER TABLE `__new_photos` RENAME TO `photos`;--> statement-breakpoint
CREATE UNIQUE INDEX `photos_object_key_unique` ON `photos` (`object_key`);--> statement-breakpoint
CREATE INDEX `photos_created_idx` ON `photos` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `photos_user_idx` ON `photos` (`user_id`);
