import { inBetween } from '../h-group/hanabi-logic.js';
import { getIgnoreOrders } from '../../basics/hanabi-util.js';

import logger from '../../tools/logger.js';
import { logCard, logConnections } from '../../tools/log.js';

/**
 * @typedef {import('../ref-sieve.js').default} Game
 * @typedef {import('../../basics/State.js').State} State
 * @typedef {import('../../basics/Action.ts').ClueAction} ClueAction
 * @typedef {import('../../types.js').Connection} Connection
 * @typedef {import('../../types.js').Identity} Identity
 * @typedef {import('../../types.js').FocusPossibility} FocusPossibility
 */

/** 
 * @param {Game} game
 * @param {Identity} identity
 * @param {number} playerIndex
 * @param {number[]} connected
 * @param {boolean} looksDirect
 * @param {number[]} ignoreOrders
 * @returns {Connection | undefined}
 */
function find_connecting(game, identity, playerIndex, connected, looksDirect, ignoreOrders) {
	const { common, state } = game;
	const hand = state.hands[playerIndex];

	const known = hand.find(o => !connected.includes(o) && common.thoughts[o].matches(identity, { infer: true }));

	if (known !== undefined && !ignoreOrders.includes(known))
		return { type: 'known', reacting: playerIndex, order: known, identities: [identity] };

	const playable = hand.find(o => ((card = common.thoughts[o]) =>
		!connected.includes(o) && (card.blind_playing || card.possible.every(i => state.isPlayable(i))) && card.inferred.has(identity))());

	if (playable !== undefined && state.deck[playable].matches(identity) && !ignoreOrders.includes(playable))
		return { type: 'playable', reacting: playerIndex, order: playable, identities: [identity] };

	if (looksDirect || playable !== undefined)
		return;

	const prompt = common.find_prompt(state, playerIndex, identity, connected);

	if (prompt !== undefined && !state.deck[prompt].matches(identity)) {
		if (state.deck[prompt].suitIndex !== -1)
			logger.warn('wrong prompt!', logCard(state.deck[prompt]), 'looks like', logCard(identity));
		return;
	}

	if (prompt !== undefined && state.deck[prompt].matches(identity) && !ignoreOrders.includes(prompt))
		return { type: 'prompt', reacting: playerIndex, order: prompt, identities: [identity] };

	const finesse = common.find_finesse(state, playerIndex, connected);

	if (finesse !== undefined && state.deck[finesse].matches(identity) && !ignoreOrders.includes(finesse)) {
		looksDirect = false;
		return { type: 'finesse', reacting: playerIndex, order: finesse, identities: [identity] };
	}
}


/**
 * @param {Game} game
 * @param {number} target_order
 * @param {Identity} identity
 * @param {number} giver
 * @param {number} target
 * @param {boolean} unknown
 * @returns {{ success: boolean, connections?: Connection[] }}
 */
export function connect(game, target_order, identity, giver, target, unknown) {
	const { state } = game;
	const { suitIndex, rank } = identity;

	let next_rank = state.play_stacks[suitIndex] + 1;
	let playerIndex = state.nextPlayerIndex(giver);
	let looped_around = false;

	/** @type {Connection[]} */
	const connections = [];

	// logger.info('attempting to connect', logCard(identity), next_rank);

	while (next_rank !== rank) {
		const next_identity = { suitIndex, rank: next_rank };
		const ignoreOrders = getIgnoreOrders(game, next_rank - state.play_stacks[suitIndex] - 1, suitIndex);
		// logger.info('looking for', logCard(next_identity), playerIndex, unknown, looped_around);
		const connecting = find_connecting(game, next_identity, playerIndex, [target_order, ...connections.map(c => c.order)], unknown && playerIndex === target, ignoreOrders);

		if (connecting !== undefined) {
			next_rank++;
			connections.push(connecting);
			looped_around = false;
		}

		if (playerIndex === target) {
			if (unknown)
				break;

			if (looped_around)
				break;
			else
				looped_around = true;
		}

		playerIndex = state.nextPlayerIndex(playerIndex);
	}
	// logger.info('found connections:', logConnections(connections, identity));

	if (next_rank !== rank)
		return { success: false, connections: [] };

	logger.info('found connections:', logConnections(connections, identity));
	return { success: true, connections };
}

/**
 * @param {Game} game
 * @param {number} target_order
 * @param {Identity} identity
 * @param {number} giver
 * @param {number} target
 * @param {boolean} unknown
 * @returns {{ success: boolean, connections?: Connection[] }}
 */
export function find_own_finesses(game, target_order, identity, giver, target, unknown) {
	const { common, me, state } = game;
	const { suitIndex, rank } = identity;

	let next_rank = state.play_stacks[suitIndex] + 1;
	let playerIndex = state.nextPlayerIndex(giver);
	let looped_around = false;

	/** @type {Connection[]} */
	const connections = [];

	logger.info('attempting to find own finesses', logCard(identity), next_rank, target_order);

	while (next_rank !== rank) {
		const next_identity = { suitIndex, rank: next_rank };
		const ignoreOrders = getIgnoreOrders(game, next_rank - state.play_stacks[suitIndex] - 1, suitIndex);
		const looksDirect = (unknown && playerIndex === target) || (playerIndex === giver);
		const connecting = find_connecting(game, next_identity, playerIndex, [target_order, ...connections.map(c => c.order)], looksDirect, ignoreOrders);

		if (connecting !== undefined) {
			next_rank++;
			connections.push(connecting);
			looped_around = false;
		}

		if (playerIndex === target) {
			// Try to connect on us
			if (!unknown || inBetween(state.numPlayers, state.ourPlayerIndex, giver, target)) {
				/** @returns {Connection | undefined} */
				const find_own_connecting = () => {
					const playable = state.ourHand.find(o => ((card = me.thoughts[o]) =>
						(card.blind_playing || card.inferred.every(i => state.isPlayable(i))) && card.inferred.has(next_identity))());

					if (playable !== undefined && !ignoreOrders.includes(playable))
						return { type: 'playable', reacting: state.ourPlayerIndex, order: playable, identities: [next_identity] };

					if (unknown && state.ourPlayerIndex === target)
						return;

					const prompt = common.find_prompt(state, state.ourPlayerIndex, next_identity, connections.map(c => c.order));

					if (prompt !== undefined && !ignoreOrders.includes(prompt))
						return { type: 'prompt', reacting: state.ourPlayerIndex, order: prompt, identities: [next_identity] };

					const finesse = common.find_finesse(state, state.ourPlayerIndex, connections.map(c => c.order));

					if (finesse !== undefined && !ignoreOrders.includes(finesse))
						return { type: 'finesse', reacting: state.ourPlayerIndex, order: finesse, identities: [next_identity] };
				};

				const own_connecting = find_own_connecting();

				if (own_connecting !== undefined) {
					next_rank++;
					connections.push(own_connecting);

					// Jump straight to after us
					playerIndex = state.nextPlayerIndex(state.ourPlayerIndex);
					looped_around = false;
					continue;
				}
			}

			if (unknown)
				break;

			if (looped_around)
				break;
			else
				looped_around = true;
		}

		playerIndex = state.nextPlayerIndex(playerIndex);
	}

	if (next_rank !== rank)
		return { success: false, connections: [] };

	logger.info('found connections:', logConnections(connections, identity));
	return { success: true, connections };
}
