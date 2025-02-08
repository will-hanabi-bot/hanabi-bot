import { Game } from '../basics/Game.js';
import { interpret_clue } from './playful-sieve/interpret-clue.js';
import { interpret_discard } from './playful-sieve/interpret-discard.js';
import { interpret_play } from './playful-sieve/interpret-play.js';
import { take_action } from './playful-sieve/take-action.js';
import { update_turn } from './playful-sieve/update-turn.js';

/**
 * @typedef {import('../variants.js').Variant} Variant
 * @typedef {import('../basics/State.js').State} State
 * @typedef {import('../types-live.js').TableOptions} TableOptions
 * @typedef {import('../types.js').ClueAction} ClueAction
 * @typedef {import('../types.js').DiscardAction} DiscardAction
 * @typedef {import('../types.js').TurnAction} TurnAction
 * @typedef {import('../types.js').PlayAction} PlayAction
 */

export default class PlayfulSieve extends Game {
	convention_name = 'PlayfulSieve';

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

	/**
	 * @param {number} tableID
	 * @param {State} state
	 * @param {boolean} in_progress
	 */
	constructor(tableID, state, in_progress) {
		super(tableID, state, in_progress);
	}

	createBlank() {
		const blank = super.createBlank();
		blank.notes = this.notes;
		blank.rewinds = this.rewinds;
		blank.locked_shifts = this.locked_shifts;
		return blank;
	}

	minimalCopy() {
		const newGame = super.minimalCopy();
		newGame.locked_shifts = this.locked_shifts.slice();
		newGame.copyDepth = this.copyDepth + 1;
		return newGame;
	}
}
