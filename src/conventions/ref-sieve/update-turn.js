import { team_elimP } from '../../basics/helper.js';
import * as Basics from '../../basics.js';

import logger from '../../tools/logger.js';
import { logCard, logConnection } from '../../tools/log.js';

/**
 * @typedef {import('../playful-sieve.js').default} Game
 * @typedef {import('../../basics/State.js').State} State
 * @typedef {import('../../basics/Player.js').Player} Player
 * @typedef {import('../../basics/Card.js').Card} Card
 * @typedef {import('../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../types.js').TurnAction} TurnAction
 * @typedef {import('../../types.js').Connection} Connection
 * @typedef {import('../../types.js').WaitingConnection} WaitingConnection
 * @typedef {import('../../types.js').IgnoreAction} IgnoreAction
 * @typedef {Partial<{ remove: boolean, remove_finesse: boolean, next_index: number, rewind: boolean }>} ResolveResult
 */

/**
 * "Undoes" a connection by reverting/removing notes on connecting cards.
 * @param {Player} common
 * @param {WaitingConnection} waiting_connection
 */
function remove_finesse_conns(common, waiting_connection) {
	const { connections, focus, inference, symmetric } = waiting_connection;

	let newCommon = common;

	// Remove remaining finesses
	for (const connection of connections) {
		const card = newCommon.thoughts[connection.order];

		// Notes are not written on symmetric connections. Thus, no need to remove finesses
		if (symmetric)
			continue;

		let new_inferred = card.inferred;

		if (connection.type === 'finesse' || connection.type === 'prompt') {
			if (card.hidden)
				new_inferred = card.inferred.intersect([]);
			else
				new_inferred = card.inferred.subtract(connection.identities);
		}

		const card_reset = !card.superposition && new_inferred.length === 0;

		if (card_reset) {
			if (card.old_inferred !== undefined)
				new_inferred = card.old_inferred.intersect(card.possible);
			else
				logger.error(`no old inferences on card ${logCard(card)} ${connection.order} (while removing finesse)! current inferences ${card.inferred.map(logCard)}`);
		}

		newCommon = newCommon.withThoughts(connection.order, (draft) => {
			draft.inferred = new_inferred;

			if (card_reset) {
				draft.finessed = false;
				draft.hidden = false;

				if (draft.old_inferred !== undefined) {
					// Don't try to restore old inferences again
					draft.superposition = true;
					draft.old_inferred = undefined;
				}
			}
		});
	}

	// Remove inference (if possible)
	if (newCommon.thoughts[focus].possible.length > 1)
		newCommon = newCommon.withThoughts(focus, (draft) => { draft.inferred = newCommon.thoughts[focus].inferred.subtract(inference); });

	if (newCommon.thoughts[focus].inferred.length === 0 && !newCommon.thoughts[focus].reset)
		newCommon.thoughts = newCommon.thoughts.with(focus, newCommon.reset_card(focus));

	return newCommon;
}


/**
 * @param {Game} game
 * @param {WaitingConnection} waiting_connection
 * @returns {ResolveResult}
 */
function resolve_card_retained(game, waiting_connection) {
	const { common, state } = game;
	const { connections, conn_index, inference } = waiting_connection;
	const { type, reacting, order, identities } = connections[conn_index];
	const last_action = game.last_actions[reacting];

	if (type === 'finesse' || type === 'prompt') {
		const card = state.deck[order];
		if (card.suitIndex !== -1 && state.play_stacks[card.suitIndex] + 1 < card.rank) {
			logger.warn(`${state.playerNames[reacting]} didn't play into unplayable ${type}`);
			return { remove: false };
		}

		if (last_action?.type === 'clue')
			return { remove: true };

		if (last_action?.type === 'play') {
			const { order: reacting_order } = last_action;

			if (type === 'finesse') {
				const play = common.thoughts[reacting_order];
				const expected_play = common.thoughts[order];

				if (play.finessed && play.finesse_index < expected_play.finesse_index) {
					logger.warn(`${state.playerNames[reacting]} played into older finesse ${play.finesse_index} < ${expected_play.finesse_index}, continuing to wait`);
					return { remove: false };
				}

				if (play.finessed && expected_play.hidden && expected_play.clued && play.finesse_index === expected_play.finesse_index) {
					logger.warn(`${state.playerNames[reacting]} jumped ahead in layered finesse, continuing to wait`);
					return { remove: false };
				}
			}
			else if (type === 'prompt') {
				logger.warn(`${state.playerNames[reacting]} played into something else, continuing to wait`);
				return { remove: false };
			}
		}

		// Check if the card could be superpositioned on a finesse that is not yet playable.
		const unplayable_connections = common.waiting_connections.filter(wc =>
			wc.conn_index !== -1 &&
			wc !== waiting_connection &&
			wc.connections.some((conn, index) =>
				index >= conn_index && conn.order === order && conn.identities.some(i => state.playableAway(i) > 0)) &&
			// The reacting player has to wait for someone else, or they already tried to play
			(wc.connections[wc.conn_index].reacting !== reacting || last_action?.type === 'play'));

		if (unplayable_connections.length > 0) {
			logger.warn(last_action?.type, 'but not all possibilities playable', unplayable_connections.map(wc =>
				`${wc.connections.map(logConnection).join(' -> ')}  (${wc.connections.find((conn, index) =>
					index >= conn_index && conn.order === order && conn.identities.some(i => state.playableAway(i) > 0)
				).identities.map(logCard).join()})`));
			return { remove: false };
		}

		const attempted_bomb = last_action?.type === 'discard' && last_action.failed &&
			identities.some(i => game.players[reacting].thoughts[last_action.order].possible.has(i));

		if (attempted_bomb) {
			logger.warn(`${state.playerNames[reacting]} bombed, maybe tried to play into it`);
			return { remove: false };
		}

		if (type === 'prompt' && last_action?.type === 'discard' && last_action.intentional) {
			logger.highlight('cyan', 'allowing delaying a prompt for an intentional discard');
			return { remove: false };
		}

		logger.warn(`${state.playerNames[reacting]} didn't play into ${type}, removing inference ${logCard(inference)}`);
		return { remove: true, remove_finesse: true };
	}

	if (last_action?.type === 'discard' && !last_action.failed && !last_action.intentional && !state.screamed_at && !state.generated) {
		const unplayable_identities = identities.filter(i => !state.isBasicTrash(i) && !state.isPlayable(i));
		if (unplayable_identities.length > 0) {
			logger.warn('discarded but not all possibilities playable', unplayable_identities.map(logCard));
			return { remove: false };
		}

		logger.warn(`${state.playerNames[reacting]} discarded with a waiting connection, removing inference ${logCard(inference)}`);
		return { rewind: true };
	}

	return { remove: false };
}

/**
 * @param {Game} game
 * @param {WaitingConnection} waiting_connection
 * @returns {ResolveResult}
 */
function resolve_card_gone(game, waiting_connection) {
	const { common, state } = game;
	const { connections, conn_index, focus, inference } = waiting_connection;
	const { reacting, order, identities } = connections[conn_index];
	const last_action = game.last_actions[reacting];

	// Played and waiting card matches expectation
	if (last_action.type === 'play' && last_action.order === order && identities.some(identity => state.deck[last_action.order].matches(identity))) {
		logger.info(`waiting card ${identities.length === 1 ? logCard(identities[0]) : '(unknown)'} played`);

		// Advance waiting connection to next card that still exists
		const next_index = connections.findIndex((conn, index) =>
			index > conn_index && state.hands[conn.reacting].includes(conn.order));

		return { remove: next_index === -1, next_index };
	}

	logger.info(`didn't play, removing connection as ${logCard(inference)} ${common.thoughts[focus].inferred.map(logCard).join()} ${focus}`);
	return { remove: true, remove_finesse: true };
}

/**
 * Performs relevant updates after someone takes a turn.
 * 
 * Impure!
 * @param {Game} game
 * @param {TurnAction} action
 */
export function update_turn(game, action) {
	const { common, state } = game;
	const { currentPlayerIndex } = action;

	/** @type {number[]} */
	const to_remove = [];

	/** @type {number[]} */
	const remove_finesses = [];

	let newGame = game.shallowCopy();

	for (let i = 0; i < newGame.common.waiting_connections.length; i++) {
		const waiting_connection = newGame.common.waiting_connections[i];
		const { connections, conn_index, focus, inference, action_index, symmetric } = waiting_connection;
		const { reacting, order, identities } = connections[conn_index];
		logger.info(`waiting for connecting ${logCard(state.deck[order])} ${order} as ${identities.map(logCard)} (${state.playerNames[reacting]}) for inference ${logCard(inference)} ${focus}${symmetric ? ' (symmetric)' : ''}`);

		if (state.lastPlayerIndex(currentPlayerIndex) !== reacting)
			continue;

		const { remove, remove_finesse, next_index, rewind } = state.hands[reacting].includes(order) ?
			resolve_card_retained(newGame, waiting_connection) :
			resolve_card_gone(newGame, waiting_connection);

		if (rewind) {
			const new_game = game.rewind(action_index, [{ type: 'ignore', conn_index: 0, order, inference }]);
			if (new_game) {
				new_game.notes = new_game.updateNotes();
				Object.assign(game, new_game);
				return;
			}

			to_remove.push(i);
			remove_finesses.push(i);
			continue;
		}

		if (remove)
			to_remove.push(i);
		else if (next_index !== undefined)
			waiting_connection.conn_index = next_index;

		if (remove_finesse)
			remove_finesses.push(i);
	}

	for (const i of remove_finesses)
		newGame.common = remove_finesse_conns(newGame.common, common.waiting_connections[i]);

	// Filter out connections that have been removed (or connections to the same card where others have been demonstrated)
	newGame.common.waiting_connections = common.waiting_connections.filter((_, i) => !to_remove.includes(i));

	newGame.common = newGame.common.good_touch_elim(state).update_hypo_stacks(state);
	newGame = team_elimP(newGame);

	Basics.mutate(game, newGame);
	return newGame;
}
