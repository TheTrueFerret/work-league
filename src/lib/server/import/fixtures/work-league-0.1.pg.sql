-- Work League 0.1: one set of tables for every game module.
-- Moves the original pool ladder's data across unchanged; every existing match
-- becomes a `pool` match and keeps its ratings.

-- participants -> match_players, with numeric sides and placements
ALTER TABLE "participants" RENAME TO "match_players";--> statement-breakpoint
ALTER TABLE "match_players" RENAME CONSTRAINT "participants_match_id_player_id_pk" TO "match_players_match_id_player_id_pk";--> statement-breakpoint
ALTER TABLE "match_players" RENAME CONSTRAINT "participants_match_id_matches_id_fk" TO "match_players_match_id_matches_id_fk";--> statement-breakpoint
ALTER TABLE "match_players" RENAME CONSTRAINT "participants_player_id_players_id_fk" TO "match_players_player_id_players_id_fk";--> statement-breakpoint
ALTER INDEX "participants_player" RENAME TO "match_players_player";--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "side" smallint;--> statement-breakpoint
ALTER TABLE "match_players" ADD COLUMN "placement" smallint;--> statement-breakpoint
UPDATE "match_players" SET "side" = CASE "team" WHEN 'A' THEN 0 ELSE 1 END, "placement" = CASE WHEN "won" THEN 1 ELSE 2 END;--> statement-breakpoint
ALTER TABLE "match_players" ALTER COLUMN "side" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" ALTER COLUMN "placement" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "match_players" DROP COLUMN "team";--> statement-breakpoint
ALTER TABLE "match_players" DROP COLUMN "won";--> statement-breakpoint
ALTER TABLE "match_players" ALTER COLUMN "rating_before" DROP DEFAULT;--> statement-breakpoint
DROP TYPE "public"."team_side";--> statement-breakpoint

-- matches belong to a game module and carry that game's details
ALTER TABLE "matches" ADD COLUMN "module_id" text DEFAULT 'pool' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "module_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "matches" AS m SET "details" = jsonb_build_object('winner', w."side")
	FROM (SELECT DISTINCT ON ("match_id") "match_id", "side" FROM "match_players" WHERE "placement" = 1) AS w
	WHERE w."match_id" = m."id";--> statement-breakpoint
DROP INDEX "matches_played_at";--> statement-breakpoint
CREATE INDEX "matches_module_played_at" ON "matches" USING btree ("module_id","played_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint

-- standings -> ratings, one row per player per game
ALTER TABLE "standings" RENAME TO "ratings";--> statement-breakpoint
ALTER TABLE "ratings" RENAME CONSTRAINT "standings_player_id_players_id_fk" TO "ratings_player_id_players_id_fk";--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "module_id" text DEFAULT 'pool' NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "module_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ratings" DROP CONSTRAINT "standings_pkey";--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_module_id_player_id_pk" PRIMARY KEY("module_id","player_id");--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "rating" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "peak" DROP DEFAULT;--> statement-breakpoint

-- instance settings, branding and sign-in throttling
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "brand_assets" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
