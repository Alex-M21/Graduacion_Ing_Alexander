ALTER TABLE `guests` ADD `access_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `guests_access_hash_unique` ON `guests` (`access_hash`);