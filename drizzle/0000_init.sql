CREATE TABLE `brand_assets` (
	`key` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`data` blob NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `game_versions` (
	`module_id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `match_players` (
	`match_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`side` integer NOT NULL,
	`placement` integer NOT NULL,
	`rating_before` integer NOT NULL,
	`delta` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`match_id`, `player_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `match_players_player` ON `match_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module_id` text NOT NULL,
	`played_at` integer NOT NULL,
	`note` text,
	`details` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `matches_module_played_at` ON `matches` (`module_id`,`played_at`,`id`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_name_unique` ON `players` (lower("name"));--> statement-breakpoint
CREATE TABLE `ratings` (
	`module_id` text NOT NULL,
	`player_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`games` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`peak` integer NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`form` text DEFAULT '' NOT NULL,
	`last_played` integer,
	PRIMARY KEY(`module_id`, `player_id`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
