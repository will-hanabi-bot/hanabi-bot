import { IdentitySet } from './IdentitySet.js';
import { Player } from './Player.js';
import { ActualCard } from '../basics/Card.js';
import { State } from '../basics/State.js';
import { handle_action } from '../action-handler.js';
import * as Utils from '../tools/util.js';

import logger from '../tools/logger.js';
import { logCard, logPerformAction } from '../tools/log.js';
import { produce, produceC } from '../StateProxy.js';


/**
 * @typedef {import('../types.js').Action} Action
 * @typedef {import('../types.js').BaseClue} BaseClue
 * @typedef {import('../types.js').Identity} Identity
 * @typedef {import('../types.js').ClueAction} ClueAction
 * @typedef {import('../types.js').DiscardAction} DiscardAction
 * @typedef {import('../types.js').TurnAction} TurnAction
 * @typedef {import('../types.js').PlayAction} PlayAction
 * @typedef {import('../types.js').IdentifyAction} IdentifyAction
 * @typedef {import('../types.js').PerformAction} PerformAction
 */

export class Game {
	convention_name = '';
	good_touch = true;

	in_progress = false;
	catchup = false;

	/** @type {State} */
	state;

	players = /** @type {Player[]} */ ([]);

	/** @type {Player} */
	common;

	last_actions = /** @type {((ClueAction | PlayAction | DiscardAction) & {lock?: boolean})[]} */ ([]);
	handHistory = /** @type {number[][]} */ ([]);

	notes = /** @type {{turn: number, last: string, full: string}[]} */ ([]);

	rewinds = 0;
	rewindDepth = 0;
	copyDepth = 0;

	/**
	 * The orders of cards to ignore in the next play clue.
	 * @type {{order: number, inference?: Identity}[][]}
	 */
	next_ignore = [];
	/**
	 * Information about the next finesse that reveals hidden layers.
	 * @type {{ list: number[], clue: BaseClue }[]}
	 */
	next_finesse = [];

	handle_action = handle_action;

	/**
	 * A function that executes after all cards have been drawn.
	 * @param {this} [_game]
	 */
	hookAfterDraws = (_game) => {};

	/**
	 * @param {number} tableID
	 * @param {State} state
	 * @param {boolean} in_progress
	 */
	constructor(tableID, state, in_progress) {
		/** @type {number} */
		this.tableID = tableID;
		this.state = state;
		this.in_progress = in_progress;

		const all_possible = new IdentitySet(state.variant.suits.length);

		for (let i = 0; i < state.numPlayers; i++)
			this.players[i] = new Player(i, all_possible, all_possible, Array.from({ length: state.variant.suits.length }, _ => 0));

		this.common = new Player(-1, all_possible, all_possible, Array.from({ length: state.variant.suits.length }, _ => 0));
	}

	/** @param {Game} json */
	static fromJSON(json) {
		const res = new Game(json.tableID, State.fromJSON(json.state), json.in_progress);

		for (const property of Object.getOwnPropertyNames(res)) {
			switch (property) {
				case 'players':
					res.players = json.players.map(Player.fromJSON);
					break;
				case 'common':
					res.common = Player.fromJSON(json.common);
					break;
				default:
					res[property] = Utils.objClone(json[property]);
					break;
			}
		}
		return res;
	}

	get me() {
		return this.players[this.state.ourPlayerIndex];
	}

	get allPlayers() {
		return this.players.concat(this.common);
	}

	get hash() {
		const { clue_tokens, turn_count, actionList } = this.state;
		const hands = this.state.hands.flat();
		const player_thoughts = this.allPlayers.flatMap(player => player.thoughts.flatMap(c => c.inferred.map(logCard).join()).join()).join();
		const deck = this.state.deck.map(logCard);

		return `${hands},${player_thoughts},${deck},${JSON.stringify(actionList.at(-1))},${clue_tokens},${turn_count}`;
	}

	/**
	 * Returns a blank copy of the game, as if it had restarted.
	 * @returns {this}
	 */
	createBlank() {
		const newGame = new /** @type {any} */ (this.constructor)(this.tableID, this.state.createBlank(), this.in_progress);
		newGame.notes = this.notes;
		newGame.rewinds = this.rewinds;
		return newGame;
	}

	/**
	 * @returns {this}
	 */
	shallowCopy() {
		const newGame = new /** @type {any} */ (this.constructor)(this.tableID, this.state, this.in_progress);

		for (const key of Object.getOwnPropertyNames(this))
			newGame[key] = this[key];

		return newGame;
	}

	/**
	 * Returns a copy of the state with only minimal properties (cheaper than cloning).
	 * @returns {this}
	 */
	minimalCopy() {
		const newGame = new /** @type {any} */ (this.constructor)(this.tableID, this.state.minimalCopy(), this.in_progress);

		if (this.copyDepth > 100)
			throw new Error('Maximum recursive depth reached.');

		const minimalProps = ['players', 'common', 'last_actions', 'rewindDepth', 'next_ignore', 'next_finesse', 'handHistory'];

		for (const property of minimalProps)
			newGame[property] = Utils.objClone(this[property]);

		newGame.copyDepth = this.copyDepth + 1;
		return newGame;
	}

	/**
	 * @abstract
	 * @param {Omit<ClueAction, "type">} _action
	 * @returns {this}
	 */
	interpret_clue(_action) {
		throw new Error('must be implemented by subclass!');
	}

	/**
	 * @abstract
	 * @param {Omit<DiscardAction, "type">} _action
	 * @returns {this}
	 */
	interpret_discard(_action) {
		throw new Error('must be implemented by subclass!');
	}

	/**
	 * @abstract
	 * @param  {PlayAction} _action
	 * @returns {this}
	 */
	interpret_play(_action) {
		throw new Error('must be implemented by subclass!');
	}

	/**
	 * @abstract
	 * @returns {Promise<PerformAction>}
	 */
	async take_action() {
		throw new Error('must be implemented by subclass!');
	}

	/**
	 * @abstract
	 * @param {Omit<TurnAction, "type">} _action
	 * @returns {this}
	 */
	update_turn(_action) {
		throw new Error('must be implemented by subclass!');
	}

	/**
	 * Updates notes on cards.
	 */
	updateNotes() {
		const { common, state } = this;

		if (state.options.speedrun)
			return this.notes;

		return produce(this.notes, (draft) => {
			for (const order of state.hands.flat()) {
				const card = common.thoughts[order];

				if (!card.saved && !card.called_to_discard)
					continue;

				draft[order] ??= { last: '', turn: 0, full: '' };

				let note = card.getNote();

				const links = common.links.filter(link => link.promised && link.orders.includes(order));

				if (links.length > 0) {
					const link_note = links.flatMap(link => link.identities).map(logCard).join('? ') + '?';

					if (note.includes("]"))
						note += link_note;
					else
						note = `[${note}] ${link_note}`;
				}

				// Only write a new note if it's different from the last note and is a later turn
				if (note !== draft[order].last && state.turn_count > draft[order].turn) {
					draft[order].last = note;
					draft[order].turn = state.turn_count;

					if (draft[order].full !== '')
						draft[order].full += ' | ';

					draft[order].full += `t${state.turn_count}: ${note}`;

					if (!this.catchup && this.in_progress)
						Utils.sendCmd('note', { tableID: this.tableID, order, note: draft[order].full });
				}
			}
		});
	}

	/**
	 * Rewinds the state to a particular action index, inserts the rewind actions just before it and then replays all future moves.
	 * @param {number} action_index
	 * @param {Action[]} rewind_actions	The rewind action to insert before the target action
	 * @returns {this | undefined}
	 */
	rewind(action_index, rewind_actions) {
		const actionList = this.state.actionList.map(list => list.map(Utils.cleanAction));

		this.rewinds++;
		if (this.rewinds > 100)
			throw new Error('Attempted to rewind too many times!');

		if (this.rewindDepth > 3)
			throw new Error('Rewind depth went too deep!');

		if (action_index === undefined || (typeof action_index !== 'number') || action_index < 0 || action_index >= actionList.length) {
			logger.error(`Attempted to rewind to an invalid action index (${JSON.stringify(action_index)})!`);
			return;
		}
		this.rewindDepth++;

		const pivotal_action = /** @type {ClueAction} */ (actionList[action_index].find(a => ['play', 'clue', 'discard'].includes(a.type)));

		logger.highlight('cyan', `Rewinding to insert ${rewind_actions.map(a => JSON.stringify(a))} on turn ${action_index}`);

		if (actionList[action_index].some(action => rewind_actions.some(a => Utils.objEquals(action, a)))) {
			logger.error(`Attempted to rewind ${rewind_actions.map(a => JSON.stringify(a))} that was already rewinded!`);
			return;
		}

		if (pivotal_action.type === 'clue')
			pivotal_action.mistake = this.rewindDepth > 1;

		logger.highlight('green', '------- STARTING REWIND -------');

		let newGame = this.createBlank();
		newGame.catchup = true;
		newGame.notes = [];
		const history = actionList.slice(0, action_index).flat();

		const old_global_game = Utils.globals.game;
		Utils.globalModify({ game: newGame });

		let injected = false;

		/** @param {Action} action */
		const catchup_action = (action) => {
			if (!injected && action.type !== 'draw' && action.type !== 'identify') {
				newGame.hookAfterDraws(newGame);
				injected = true;
			}

			const our_action = action.type === 'clue' && action.giver === this.state.ourPlayerIndex;

			if (!our_action) {
				newGame = newGame.handle_action(action);
				return;
			}

			let hypoGame = newGame.minimalCopy();

			newGame.state.hands[this.state.ourPlayerIndex] = this.handHistory[Math.max(1, newGame.state.turn_count)];

			newGame = newGame.handle_action(action);

			// Simulate the actual hand as well for replacement
			logger.off();

			Utils.globalModify({ game: hypoGame });
			hypoGame = hypoGame.handle_action(action);
			Utils.globalModify({ game: newGame });

			logger.on();

			newGame.state.hands[this.state.ourPlayerIndex] = hypoGame.state.hands[this.state.ourPlayerIndex];
		};

		/** @param {Action} action */
		const after_action = (action) => {
			if (!injected && action.type !== 'draw' && action.type !== 'identify') {
				newGame.hookAfterDraws(newGame);
				injected = true;
			}
			newGame = newGame.handle_action(action);
		};

		logger.wrapLevel(logger.LEVELS.ERROR, () => {
			// Get up to speed
			for (const action of history)
				catchup_action(action);
		});

		const remaining_id_actions = /** @type {IdentifyAction[]} */ ([]);

		// Rewrite and save as a rewind action
		for (const action of rewind_actions) {
			if (action.type === 'identify' && !newGame.state.hands[action.playerIndex].includes(action.order)) {
				remaining_id_actions.push(action);
			}
			else {
				after_action(action);

				if (action.type === 'draw' && action.order === remaining_id_actions[0]?.order)
					after_action(remaining_id_actions.shift());
			}
		}

		// Redo all the following actions
		const future = actionList.slice(action_index, -1).flat();
		for (const action of future) {
			after_action(action);

			if (action.type === 'draw' && action.order === remaining_id_actions[0]?.order)
				after_action(remaining_id_actions.shift());
		}

		logger.highlight('green', '------- REWIND COMPLETE -------');

		newGame.catchup = this.catchup;
		for (const action of actionList.at(-1))
			after_action(action);

		for (const [order, noteObj] of this.notes.entries())
			newGame.notes[order] = noteObj;

		Utils.globalModify({ game: old_global_game });

		return /** @type {this} */ (newGame);
	}

	/**
	 * Navigates the state to the beginning of a particular turn. Must be in 'replay' mode.
	 * @param {number} turn
	 */
	navigate(turn) {
		logger.highlight('greenb', `------- NAVIGATING (turn ${turn}) -------`);

		let new_game = this.createBlank();
		new_game.catchup = true;
		new_game.notes = [];

		const old_global_game = Utils.globals.game;
		Utils.globalModify({ game: new_game });

		// Remove special actions from the action list (they will be added back in when rewinding)
		const actionList = this.state.actionList.map(list => list.filter(action => !['identify', 'ignore', 'finesse'].includes(action.type)).map(Utils.cleanAction));
		const actions = actionList.flat();

		let action_index = 0;

		// Going first
		if (turn === 1 && new_game.state.ourPlayerIndex === 0) {
			let action = actions[action_index];

			while(action.type === 'draw') {
				new_game = new_game.handle_action(action);
				action_index++;
				action = actions[action_index];
			}
		}
		else {
			// Don't log history
			logger.wrapLevel(logger.LEVELS.ERROR, () => {
				while (new_game.state.turn_count < turn - 1) {
					new_game = new_game.handle_action(actions[action_index]);
					action_index++;

				}
			});

			// Log the previous turn and the 'turn' action leading to the desired turn
			while (new_game.state.turn_count < turn && actions[action_index] !== undefined) {
				new_game = new_game.handle_action(actions[action_index]);
				action_index++;
			}
		}

		new_game.catchup = this.catchup;

		if (!new_game.catchup && new_game.state.currentPlayerIndex === this.state.ourPlayerIndex) {
			new_game.take_action().then(suggested_action =>
				logger.highlight('cyan', 'Suggested action:', logPerformAction(suggested_action)));
		}

		// Copy over the full game history
		new_game.state.actionList = actionList;
		Utils.globalModify({ game: old_global_game });
		return new_game;
	}

	simulateClean() {
		const hypo_game = this.minimalCopy();
		hypo_game.catchup = true;
		hypo_game.rewind = () => undefined;

		const all_orders = this.state.hands.flat();

		// Remove all existing newly clued notes
		hypo_game.state = produce(hypo_game.state, (draft) => {
			for (const o of all_orders)
				draft.deck[o].newly_clued = false;
		});

		hypo_game.players = hypo_game.players.map(produceC((draft) => {
			for (const o of all_orders)
				draft.thoughts[o].newly_clued = false;
		}));

		hypo_game.common = produce(hypo_game.common, (draft) => {
			for (const o of all_orders)
				draft.thoughts[o].newly_clued = false;
		});
		return hypo_game;
	}

	/**
	 * Returns a hypothetical state where the provided clue was given.
	 * This is slightly different from simulate_action() in that the normal "clue cleanup" actions are not taken.
	 * 
	 * The 'enableLogs' option causes all logs from the simulated state to be printed.
	 * Otherwise, only errors are printed from the simulated state.
	 * @param {ClueAction} action
	 * @param {{enableLogs?: boolean}} options
	 */
	simulate_clue(action, options = {}) {
		let hypo_game = this.simulateClean();

		const old_global_game = Utils.globals.game;
		Utils.globalModify({ game: hypo_game });

		const last_level = logger.level;
		logger.setLevel(options.enableLogs ? logger.level : logger.LEVELS.ERROR);

		hypo_game = hypo_game.interpret_clue(action);

		logger.setLevel(last_level);
		Utils.globalModify({ game: old_global_game });

		hypo_game.catchup = false;
		hypo_game.state.turn_count++;
		return hypo_game;
	}

	/**
	 * Returns a hypothetical state where the provided action was taken.
	 * 
	 * The 'enableLogs' option causes all logs from the simulated state to be printed.
	 * Otherwise, only errors are printed from the simulated state.
	 * @param {Action} action
	 * @param {{enableLogs?: boolean}} options
	 */
	simulate_action(action, options = {}) {
		let hypo_game = this.simulateClean();

		const old_global_game = Utils.globals.game;
		Utils.globalModify({ game: hypo_game });

		const last_level = logger.level;
		logger.setLevel(options.enableLogs ? logger.level : logger.LEVELS.ERROR);

		hypo_game = hypo_game.handle_action(action);

		if (action.type === 'play' || action.type === 'discard') {
			hypo_game = hypo_game.handle_action({ type: 'turn', num: hypo_game.state.turn_count, currentPlayerIndex: action.playerIndex });

			if (hypo_game.state.cardsLeft > 0) {
				const order = hypo_game.state.cardOrder + 1;
				const { suitIndex, rank } = hypo_game.state.deck[order] ?? Object.freeze(new ActualCard(-1, -1, order, hypo_game.state.turn_count));
				hypo_game = hypo_game.handle_action({ type: 'draw', playerIndex: action.playerIndex, order, suitIndex, rank });
			}
		}

		logger.setLevel(last_level);
		Utils.globalModify({ game: old_global_game });

		hypo_game.catchup = false;
		return hypo_game;
	}
}
