CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`type` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `auth_tokens_token_hash_idx` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;