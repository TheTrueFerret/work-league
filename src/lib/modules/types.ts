import type { Component } from 'svelte';
import type { GenericSchema } from 'valibot';
import type { RatingConfig } from '$lib/core/rating/elo';

/**
 * Everything Work League needs to know about a game. A module is one folder
 * under `src/lib/modules/<id>` that default-exports one of these, listed once
 * in `registry.ts`. The shell, the database and the rating engine are shared;
 * the module only decides how a match is played and who won.
 */
export interface GameModule<Details = unknown> {
	/** URL slug and database key. Never change it once matches exist. */
	readonly id: string;
	readonly name: string;
	/** One line for the launcher card. */
	readonly description: string;
	/** Seed colour for the module; harmonised with the league's brand colour. */
	readonly accent: string;
	/** A 24×24 stroke icon as SVG path data. */
	readonly icon: string;

	/** How many sides a match can have and how many players each side holds. */
	readonly format: MatchFormat;
	readonly rating: RatingConfig;

	/** Validates the match details the browser submits. */
	readonly details: GenericSchema<unknown, Details>;
	/**
	 * Works out where each side finished, 1 being first. Runs on the server
	 * before anything is written, so it must reject anything impossible —
	 * never trust a winner the browser claims.
	 */
	resolve(details: Details, sides: readonly (readonly number[])[]): number[];
	/** A short summary for history rows, such as "11–7 · 9–11 · 11–5". */
	summarize?(details: Details): string | null;
	/** Extra numbers for a player's profile, computed from their matches. */
	playerStats?(entries: readonly PlayerMatch<Details>[]): StatLine[];

	/** The screen for playing or recording a match. Loaded only when opened. */
	readonly Record: () => Promise<{ default: Component<RecordProps> }>;
}

export interface MatchFormat {
	readonly sides: { readonly min: number; readonly max: number };
	readonly playersPerSide: { readonly min: number; readonly max: number };
}

/** One of a player's matches, as handed to `playerStats`. */
export interface PlayerMatch<Details = unknown> {
	readonly details: Details;
	/** Which side the player was on. */
	readonly side: number;
	/** Every side's player ids, so a module can find this player in its own data. */
	readonly sides: readonly (readonly number[])[];
	readonly placement: number;
	readonly playerId: number;
}

export interface StatLine {
	readonly label: string;
	readonly value: string;
}

/** A player as the record screen sees them: their standing in this game. */
export interface RosterPlayer {
	readonly id: number;
	readonly name: string;
	readonly rating: number;
	readonly games: number;
}

export interface MatchSubmission<Details = unknown> {
	readonly sides: number[][];
	readonly details: Details;
	readonly note?: string;
}

export interface RecordProps {
	readonly players: readonly RosterPlayer[];
	readonly rating: RatingConfig;
	/** Sends the result to the server. Resolves true once saved, false if rejected. */
	readonly submit: (match: MatchSubmission) => Promise<boolean>;
	readonly submitting: boolean;
	readonly error: string | null;
}

/** Gives modules a typed way to declare themselves. */
export const defineModule = <Details>(module: GameModule<Details>): GameModule<Details> => module;
