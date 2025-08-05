import { CLUE_INTERP } from './ref-sieve/rs-constants.js';
import { Game } from '../basics/Game.js';
import { State } from '../basics/State.js';
import { RS_Player } from './rs-player.js';
import { interpret_clue } from './ref-sieve/interpret-clue.js';
import { interpret_discard } from './ref-sieve/interpret-discard.js';
import { interpret_play } from './ref-sieve/interpret-play.js';
import { take_action } from './ref-sieve/take-action.js';
import { update_turn } from './ref-sieve/update-turn.js';
import * as Utils from '../tools/util.js';

/**
 * @typedef {import('../variants.js').Variant} Variant
 * @typedef {import('../types-live.js').TableOptions} TableOptions
 * @typedef {typeof import('./ref-sieve/rs-constants.js').CLUE_INTERP} CLUE_INTERP
 * @typedef {typeof import('./ref-sieve/rs-constants.js').PLAY_INTERP} PLAY_INTERP
 * @typedef {typeof import('./ref-sieve/rs-constants.js').DISCARD_INTERP} DISCARD_INTERP
 * @typedef {CLUE_INTERP[keyof CLUE_INTERP] | PLAY_INTERP[keyof PLAY_INTERP] | DISCARD_INTERP[keyof DISCARD_INTERP]} INTERP
 * @typedef {import('../basics/Action.ts').ClueAction} ClueAction
 * @typedef {import('../basics/Action.ts').DiscardAction} DiscardAction
 * @typedef {import('../basics/Action.ts').TurnAction} TurnAction
 * @typedef {import('../basics/Action.ts').PlayAction} PlayAction
 */

export default class RefSieve extends Game {
	convention_name = 'RefSieve';

	/** @param {ClueAction} action */
	interpret_clue(action) {
		return interpret_clue(this, action);
	}

	/** @param {DiscardAction} action */
	interpret_discard(action) {
		return interpret_discard(this, action);
	}

	/** @param {PlayAction} action */
	interpret_play(action) {
		return interpret_play(this, action);
	}

	async take_action() {
		return take_action(this);
	}

	/** @param {TurnAction} action */
	update_turn(action) {
		return update_turn(this, action);
	}

	/** @type {number[]} */
	locked_shifts = [];

	/** @type {{turn: number, move: INTERP}[]} */
	moveHistory = [];

	/**
	 * @param {State} state
	 * @param {boolean} in_progress
	 * @param {{ state: State, players: RS_Player[], common: RS_Player }} base
	 */
	constructor(state, in_progress, base = undefined) {
		super(state, in_progress);

		this.players = base?.players.map(p => p.clone()) ?? this.players.map(p =>
			new RS_Player(p.playerIndex, p.all_possible, p.all_inferred, p.hypo_stacks, p.hypo_plays, p.hypo_map, p.thoughts, p.links, p.play_links, p.unknown_plays, p.waiting_connections, p.elims));

		const c = this.common;
		this.common = base?.common ?? new RS_Player(c.playerIndex, c.all_possible, c.all_inferred, c.hypo_stacks, c.hypo_plays, c.hypo_map, c.thoughts, c.links, c.play_links, c.unknown_plays, c.waiting_connections, c.elims);

		this.base = { state: this.state.minimalCopy(), players: this.players.map(p => p.clone()), common: this.common.clone() };
	}

	/** @param {RefSieve} json */
	static fromJSON(json) {
		const res = new RefSieve(State.fromJSON(json.state), json.in_progress);

		for (const property of Object.getOwnPropertyNames(res)) {
			if (typeof res[property] === 'function')
				continue;

			switch (property) {
				case 'state':
					continue;

				case 'players':
					res.players = json.players.map(RS_Player.fromJSON);
					break;

				case 'common':
					res.common = RS_Player.fromJSON(json.common);
					break;

				default:
					res[property] = Utils.objClone(json[property]);
					break;
			}
		}

		res.moveHistory = json.moveHistory.slice();
		return res;
	}

	createBlank() {
		const blank = super.createBlank();
		blank.notes = this.notes;
		blank.rewinds = this.rewinds;
		blank.locked_shifts = this.locked_shifts;
		return blank;
	}

	minimalCopy() {
		const newGame = super.shallowCopy();
		newGame.locked_shifts = this.locked_shifts.slice();
		newGame.moveHistory = this.moveHistory.slice();
		newGame.copyDepth = this.copyDepth + 1;
		return newGame;
	}

	shallowCopy() {
		const newGame = super.shallowCopy();
		newGame.locked_shifts = this.locked_shifts;
		newGame.moveHistory = this.moveHistory;
		return newGame;
	}

	get lastMove() {
		return this.moveHistory.at(-1)?.move ?? CLUE_INTERP.NONE;
	}
}
