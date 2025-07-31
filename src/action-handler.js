import { BOT_VERSION, HAND_SIZE } from './constants.js';
import { team_elimP } from './basics/helper.js';
import * as Basics from './basics.js';

import logger from './tools/logger.js';
import { logAction, logCard } from './tools/log.js';

import { produce } from './StateProxy.js';

/**
 * @typedef {import('./basics/Action.ts').Action} Action
 * @typedef {import('./basics/Action.ts').ClueAction} ClueAction
 * @typedef {import('./basics/Action.ts').DiscardAction} DiscardAction
 * @typedef {import('./basics/Action.ts').CardAction} CardAction
 * @typedef {import('./basics/Action.ts').PlayAction} PlayAction
 * @typedef {import('./basics/Game.js').Game} Game
 */

/**
 * Impure!
 * @template {Game} T
 * @this T
 * @param {Action} 	action
 */
export function handle_action(action) {
	const { state } = this;

	let newGame = produce(this, (draft) => {
		draft.state.actionList[state.turn_count] ??= [];
		draft.state.actionList[state.turn_count].push(action);

		if (action.type === 'clue' && action.giver === state.ourPlayerIndex)
			draft.handHistory[state.turn_count] = state.ourHand.slice();
	});

	switch(action.type) {
		case 'clue': {
			// {type: 'clue', clue: { type: 1, value: 1 }, giver: 0, list: [ 8, 9 ], target: 1, turn: 0}
			const { giver, list } = action;
			logger.highlight('yellowb', `Turn ${state.turn_count}: ${logAction(state, action)}`);

			newGame = newGame.interpret_clue(action);

			newGame = produce(newGame, (draft) => {
				draft.last_actions[giver] = action;

				draft.state.dda = undefined;
				draft.state.discard_state = undefined;

				// Remove the newly_clued flag
				for (const order of list) {
					draft.state.deck[order].newly_clued = false;
					for (const player of draft.players)
						player.thoughts[order].newly_clued = false;
					draft.common.thoughts[order].newly_clued = false;
				}

				// Clear the list of ignored cards
				draft.next_ignore = [];
				draft.next_finesse = [];
			});
			break;
		}
		case 'discard': {
			// {type: 'discard', playerIndex: 2, order: 12, suitIndex: 0, rank: 3, failed: true}
			const { order, playerIndex, rank, suitIndex } = action;
			const card = state.deck[order];

			newGame = produce(newGame, (draft) => {
				if (card.identity() === undefined) {
					draft.state.deck[order].suitIndex = suitIndex;
					draft.state.deck[order].rank = rank;
				}
				draft.players[playerIndex].thoughts[order].suitIndex = suitIndex;
				draft.players[playerIndex].thoughts[order].rank = rank;

				// Assume one cannot SDCM after being screamed at
				draft.state.dda = undefined;
				draft.state.discard_state = undefined;
			});

			logger.highlight('yellowb', `Turn ${state.turn_count}: ${logAction(state, action)}`);

			newGame = newGame.interpret_discard(action);
			newGame = produce(newGame, (draft) => { draft.last_actions[playerIndex] = action; });
			break;
		}
		case 'draw': {
			// { type: 'draw', playerIndex: 0, order: 2, suitIndex: 1, rank: 2 },
			newGame = Basics.onDraw(newGame, action);

			if (state.turn_count === 0 && newGame.state.hands.every(h => h.length === HAND_SIZE[state.numPlayers]))
				newGame = produce(newGame, (draft) => { draft.state.turn_count = 1; });
			break;
		}
		case 'gameOver': {
			logger.highlight('redb', logAction(state, action));
			newGame = produce(newGame, (draft) => { draft.in_progress = false; });
			break;
		}
		case 'turn': {
			//  { type: 'turn', num: 1, currentPlayerIndex: 1 }
			const { currentPlayerIndex, num } = action;
			newGame = produce(newGame, (draft) => {
				draft.state.currentPlayerIndex = currentPlayerIndex;
				draft.state.turn_count = num + 1;

				if (num === 1 && newGame.notes[0] === undefined && !newGame.catchup && newGame.in_progress) {
					const note = `[INFO: v${BOT_VERSION}, ${newGame.convention_name + (/** @type {any} */(newGame).level ?? '')}]`;

					this.queued_cmds.push({ cmd: 'note', arg: { tableID: newGame.tableID, order: 0, note } });
					draft.notes[0] = { last: note, turn: 0, full: note };
				}
			});

			newGame = newGame.update_turn(action);
			newGame.notes = newGame.updateNotes();
			break;
		}
		case 'play': {
			const { order, playerIndex, rank, suitIndex } = action;
			const card = state.deck[order];

			newGame = produce(newGame, (draft) => {
				if (card.identity() === undefined) {
					draft.state.deck[order].suitIndex = suitIndex;
					draft.state.deck[order].rank = rank;
				}
				draft.players[playerIndex].thoughts[order].suitIndex = suitIndex;
				draft.players[playerIndex].thoughts[order].rank = rank;
			});

			logger.highlight('yellowb', `Turn ${state.turn_count}: ${logAction(state, action)}`);

			newGame = newGame.interpret_play(action);

			newGame = produce(newGame, (draft) => {
				draft.last_actions[playerIndex] = action;
				draft.state.dda = undefined;
				draft.state.discard_state = undefined;
			});
			break;
		}
		case 'identify': {
			const { order, playerIndex, identities, infer = false } = action;

			if (!state.hands[playerIndex].includes(order))
				throw new Error('Could not find card to rewrite!');

			logger.info(`identifying card with order ${order} as ${identities.map(logCard)}, infer? ${infer}`);

			const newCommon = newGame.common.withThoughts(order, (draft) => {
				draft.rewinded = true;
				if (infer) {
					// draft.inferred = newGame.common.thoughts[order].inferred.intersect(identities);
					newGame = produce(newGame, (draft) => {
						draft.players[state.ourPlayerIndex].thoughts[order].rewind_ids = state.base_ids.union(identities);
					});
				}
				else if (identities.length === 1) {
					draft.suitIndex = identities[0].suitIndex;
					draft.rank = identities[0].rank;
				}
			});

			newGame.common = newCommon;

			if (identities.length === 1) {
				if (infer) {
					newGame = produce(newGame, (draft) => {
						draft.players[state.ourPlayerIndex].thoughts[order].rewind_ids = state.base_ids.union(identities);
					});
				}
				else {
					const { suitIndex, rank } = identities[0];

					newGame = produce(newGame, (draft) => {
						draft.state.deck[order].suitIndex = suitIndex;
						draft.state.deck[order].rank = rank;
						draft.players[state.ourPlayerIndex].thoughts[order].suitIndex = suitIndex;
						draft.players[state.ourPlayerIndex].thoughts[order].rank = rank;
					});
				}
			}
			newGame = team_elimP(newGame);
			break;
		}
		case 'ignore': {
			const { conn_index, order, inference } = action;

			newGame = produce(newGame, (draft) => {
				draft.next_ignore[conn_index] ??= [];

				// Ignore the card
				draft.next_ignore[conn_index].push({ order, inference });
			});
			break;
		}
		case 'finesse':  {
			const { list, clue } = action;
			newGame = produce(newGame, (draft) => { draft.next_finesse.push({ list, clue }); });
			break;
		}
		default:
			break;
	}
	return newGame;
}
