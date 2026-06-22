CREATE TABLE `api_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text,
	`base_url` text,
	`auth_type` text DEFAULT 'none',
	`auth_config` text,
	`rate_limit` text,
	`changelog` text,
	`is_active` integer DEFAULT true,
	`icon_url` text,
	`docs_url` text,
	`endpoints` text,
	`tags` text,
	`api_version` text,
	`deprecated_at` text,
	`successor_id` text,
	`cors_supported` integer DEFAULT true,
	`requires_proxy` integer DEFAULT false,
	`credit_required` integer,
	`cache_ttl_seconds` integer,
	`verification_status` text DEFAULT 'unverified',
	`verified_at` text,
	`last_verification_note` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`flag_name` text NOT NULL,
	`enabled` integer DEFAULT false,
	`description` text,
	`rules` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flags_flag_name_unique` ON `feature_flags` (`flag_name`);--> statement-breakpoint
CREATE TABLE `generated_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`code_html` text,
	`code_css` text,
	`code_js` text,
	`framework` text DEFAULT 'vanilla',
	`ai_provider` text,
	`ai_model` text,
	`ai_prompt_used` text,
	`generation_time_ms` integer,
	`token_usage` text,
	`dependencies` text,
	`metadata` text,
	`created_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generated_codes_project_id_version_unique` ON `generated_codes` (`project_id`,`version`);--> statement-breakpoint
CREATE TABLE `platform_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`user_id` text,
	`project_id` text,
	`created_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `project_apis` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`api_id` text NOT NULL,
	`config` text,
	`created_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`api_id`) REFERENCES `api_catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_apis_project_id_api_id_unique` ON `project_apis` (`project_id`,`api_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`name` text NOT NULL,
	`context` text,
	`status` text DEFAULT 'draft',
	`deploy_url` text,
	`deploy_platform` text,
	`repo_url` text,
	`preview_url` text,
	`metadata` text,
	`current_version` integer DEFAULT 0,
	`slug` text,
	`suggested_slugs` text,
	`published_at` text,
	`created_at` text,
	`updated_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`api_id` text NOT NULL,
	`encrypted_key` text NOT NULL,
	`is_verified` integer DEFAULT false,
	`verified_at` text,
	`created_at` text,
	`updated_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`api_id`) REFERENCES `api_catalog`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_api_keys_user_id_api_id_unique` ON `user_api_keys` (`user_id`,`api_id`);--> statement-breakpoint
CREATE TABLE `user_daily_limits` (
	`user_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`generation_count` integer DEFAULT 0,
	`deploy_count` integer DEFAULT 0,
	PRIMARY KEY(`user_id`, `usage_date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`avatar_url` text,
	`email_verified` text,
	`image` text,
	`preferences` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);