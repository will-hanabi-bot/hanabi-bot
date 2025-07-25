import { ActualCard } from '../basics/Card.js';
import { HGroup_Player } from './h-player.js';
import { Game } from '../basics/Game.js';
import { State } from '../basics/State.js';
import { interpret_clue } from './h-group/clue-interpretation/interpret-clue.js';
import { interpret_discard } from './h-group/interpret-discard.js';
import { interpret_play } from './h-group/interpret-play.js';
import { take_action } from './h-group/take-action.js';
import { update_turn } from './h-group/update-turn.js';

import * as Utils from '../tools/util.js';
import { CLUE_INTERP } from './h-group/h-constants.js';

/**
 * @typedef {import('../variants.js').Variant} Variant
 * @typedef {import('../types-live.js').TableOptions} TableOptions
 * @typedef {typeof import('./h-group/h-constants.js').CLUE_INTERP} CLUE_INTERP
 * @typedef {typeof import('./h-group/h-constants.js').PLAY_INTERP} PLAY_INTERP
 * @typedef {typeof import('./h-group/h-constants.js').DISCARD_INTERP} DISCARD_INTERP
 * @typedef {CLUE_INTERP[keyof CLUE_INTERP] | PLAY_INTERP[keyof PLAY_INTERP] | DISCARD_INTERP[keyof DISCARD_INTERP]} INTERP
 * @typedef {import('../types.js').ClueAction} ClueAction
 * @typedef {import('../types.js').DiscardAction} DiscardAction
 * @typedef {import('../types.js').TurnAction} TurnAction
 * @typedef {import('../types.js').PlayAction} PlayAction
 */

export default class HGroup extends Game {
	convention_name = 'HGroup';

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

	level = 1;

	/** @type {{turn: number, move: INTERP}[]} */
	moveHistory;

	/**
	 * Identities of cards we are finessing while we are waiting to play into a finesse/
	 * @type {ActualCard[][]}
	 */
	finesses_while_finessed;

	stalled_5 = false;

	/**
	 * @param {number} tableID
	 * @param {State} state
	 * @param {boolean} in_progress
	 * @param {{ state: State, players: HGroup_Player[], common: HGroup_Player }} base
	 * @param {number} [level] 	The convention level (defaults to 1).
	 */
	constructor(tableID, state, in_progress, base = undefined, level = 1) {
		super(tableID, state, in_progress);

		this.players = base?.players.map(p => p.clone()) ?? this.players.map(p =>
			new HGroup_Player(p.playerIndex, p.all_possible, p.all_inferred, p.hypo_stacks, p.hypo_plays, p.hypo_map, p.thoughts, p.links, p.play_links, p.unknown_plays, p.waiting_connections, p.elims));

		const c = this.common;
		this.common = base?.common.clone() ?? new HGroup_Player(c.playerIndex, c.all_possible, c.all_inferred, c.hypo_stacks, c.hypo_plays, c.hypo_map, c.thoughts, c.links, c.play_links, c.unknown_plays, c.waiting_connections, c.elims);

		this.finesses_while_finessed = Array.from({ length: state.numPlayers }, _ => []);

		this.level = level;
		this.moveHistory = [];

		this.base = { state: state.minimalCopy(), players: this.players.map(p => p.clone()), common: this.common.clone() };
	}

	/** @param {HGroup} json */
	static fromJSON(json) {
		const res = new HGroup(json.tableID, State.fromJSON(json.state), json.in_progress);

		for (const property of Object.getOwnPropertyNames(res)) {
			if (typeof res[property] === 'function')
				continue;

			switch (property) {
				case 'state':
					continue;

				case 'players':
					res.players = json.players.map(HGroup_Player.fromJSON);
					break;

				case 'common':
					res.common = HGroup_Player.fromJSON(json.common);
					break;

				default:
					res[property] = Utils.objClone(json[property]);
					break;
			}
		}

		res.level = json.level;
		res.moveHistory = json.moveHistory.slice();
		res.finesses_while_finessed = json.finesses_while_finessed.map(arr => arr.map(ActualCard.fromJSON));
		res.stalled_5 = json.stalled_5;
		return res;
	}

	get me() {
		return this.players[this.state.ourPlayerIndex];
	}

	get lastMove() {
		return this.moveHistory.at(-1)?.move ?? CLUE_INTERP.NONE;
	}

	createBlank() {
		const blank = super.createBlank();
		blank.level = this.level;
		return blank;
	}

	shallowCopy() {
		const newGame = super.shallowCopy();
		newGame.level = this.level;
		newGame.moveHistory = this.moveHistory;
		newGame.finesses_while_finessed = this.finesses_while_finessed;
		newGame.stalled_5 = this.stalled_5;
		return newGame;
	}

	minimalCopy() {
		const newGame = super.minimalCopy();
		newGame.level = this.level;
		newGame.moveHistory = Utils.objClone(this.moveHistory);
		newGame.finesses_while_finessed = Utils.objClone(this.finesses_while_finessed);
		newGame.stalled_5 = this.stalled_5;
		newGame.copyDepth = this.copyDepth + 1;
		return newGame;
	}

	/** @param {INTERP} interp */
	interpretMove(interp) {
		this.moveHistory.push({ turn: this.state.turn_count, move: interp });
	}
}
