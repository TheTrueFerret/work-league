CREATE TABLE `starting_ratings` (
	`module_id` text NOT NULL,
	`player_id` integer NOT NULL,
	`rating` integer NOT NULL,
	PRIMARY KEY(`module_id`, `player_id`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
