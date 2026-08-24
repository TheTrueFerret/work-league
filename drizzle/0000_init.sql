CREATE TYPE "public"."team_side" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team" "team_side" NOT NULL,
	"won" boolean NOT NULL,
	"rating_before" integer DEFAULT 1000 NOT NULL,
	"delta" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "participants_match_id_player_id_pk" PRIMARY KEY("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"player_id" integer PRIMARY KEY NOT NULL,
	"rating" integer DEFAULT 1000 NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"peak" integer DEFAULT 1000 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"form" text DEFAULT '' NOT NULL,
	"last_played" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_played_at" ON "matches" USING btree ("played_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "participants_player" ON "participants" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "players_name_unique" ON "players" USING btree (lower("name"));