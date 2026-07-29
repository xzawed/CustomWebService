CREATE TABLE `generation_locks` (
	`project_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`acquired_at` text NOT NULL,
	`heartbeat_at` text NOT NULL
);
