import { visibleFind } from '../../basics/hanabi-util.js';

import logger from '../../tools/logger.js';
import { logCard } from '../../tools/log.js';
import { produce } from '../../StateProxy.js';

/**
 * @typedef {import('../../basics/Game.js').Game} Game
 * @typedef {import('../../basics/State.js').State} State
 * @typedef {import('../../basics/Player.js').Player} Player
 * @typedef {import('../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../types.js').Identity} Identity
 * @typedef {import('../../types.js').DiscardAction} DiscardAction
 */

/**
 * Returns the cards in hand that could be targets for a sarcastic discard.
 * @param {State} state
 * @param {number} playerIndex
 * @param {Player} player
 * @param {Identity} identity
 */
export function find_sarcastics(state, playerIndex, player, identity) {
	// First, try to see if there's already a card that is known/inferred to be that identity
	const known_sarcastic = state.hands[playerIndex].filter(o => player.thoughts[o].matches(identity, { infer: true, symmetric: true }));
	if (known_sarcastic.length > 0)
		return known_sarcastic;

	// Otherwise, find all cards that could match that identity
	return state.hands[playerIndex].filter(o => {
		const card = player.thoughts[o];

		return card.touched && card.possible.has(identity) &&
			!(card.inferred.length === 1 && card.inferred.array[0].rank < identity.rank) &&		// Do not sarcastic on connecting cards
			(card.info_lock === undefined || card.info_lock.has(identity));
	});
}

/**
 * Adds the sarcastic discard inference to the given set of sarcastic cards.
 * @param {State} state
 * @param {Player} common
 * @param {number[]} sarcastics
 * @param {Identity} identity
 */
function apply_unknown_sarcastic(state, common, sarcastics, identity) {
	let newCommon = common;

	// Need to add the inference back if it was previously eliminated due to good touch
	for (const order of sarcastics) {
		newCommon = newCommon.withThoughts(order, (draft) => {
			draft.inferred = newCommon.thoughts[order].inferred.union(identity);
			draft.trash = false;
		});
	}

	if (sarcastics.length > 0) {
		logger.info('adding link', sarcastics, logCard(identity));
		newCommon = produce(newCommon, (draft) => {
			draft.links.push({ orders: sarcastics, identities: [identity], promised: true });
		});
	}

	// Mistake discard or sarcastic with unknown transfer location (and not all playable)
	if (sarcastics.length === 0 || sarcastics.some(order => newCommon.thoughts[order].inferred.some(c => state.playableAway(c) > 0)))
		newCommon = newCommon.undo_hypo_stacks(identity);

	return newCommon;
}

/**
 * Locks the other player after a late sacrifice discard.
 * @param {State} state
 * @param {Player} common
 * @param  {number} playerIndex 	The player that performed a sacrifice discard.
 */
function apply_locked_discard(state, common, playerIndex) {
	const other = state.nextPlayerIndex(playerIndex);

	logger.highlight('cyan', `sacrifice discard, locking ${state.playerNames[other]}`);

	let newCommon = common;

	// Chop move all cards
	for (const order of state.hands[other]) {
		const card = newCommon.thoughts[order];
		if (!card.clued && !card.finessed && !card.chop_moved)
			newCommon = newCommon.withThoughts(order, (draft) => { draft.chop_moved = true; });
	}

	return newCommon;
}

/**
 * Interprets a sarcastic discard.
 * @template {Game} T
 * @param {T} game
 * @param {DiscardAction} discardAction
 */
export function interpret_sarcastic(game, discardAction) {
	const { common, me, state } = game;
	const { playerIndex, suitIndex, rank } = discardAction;
	const identity = { suitIndex, rank };

	const duplicates = visibleFind(state, me, identity);
	const locked_discard = state.numPlayers === 2 && common.thinksLocked(state, playerIndex) && !game.last_actions[state.nextPlayerIndex(playerIndex)].lock;

	const newGame = game.shallowCopy();
	let newCommon = common;

	// Unknown sarcastic discard to us
	if (duplicates.length === 0) {
		if (playerIndex === state.ourPlayerIndex)
			return { newGame, sarcastics: [] };

		const sarcastics = find_sarcastics(state, state.ourPlayerIndex, me, identity);

		if (sarcastics.length === 1) {
			newCommon = newCommon.withThoughts(sarcastics[0], (common_sarcastic) => {
				common_sarcastic.inferred = state.base_ids.union(identity);
				common_sarcastic.trash = false;
			});
		}
		else {
			newCommon = apply_unknown_sarcastic(state, newCommon, sarcastics, identity);
			if (locked_discard)
				newCommon = apply_locked_discard(state, newCommon, playerIndex);
		}

		logger.info(`writing sarcastic ${logCard(identity)} on slot(s) ${sarcastics.map(s => state.ourHand.findIndex(o => o === s) + 1)}`);
		newGame.common = newCommon;
		return { newGame, sarcastics };
	}

	// Sarcastic discard to other (or known sarcastic discard to us)
	for (let i = 0; i < state.numPlayers; i++) {
		const receiver = (state.ourPlayerIndex + i) % state.numPlayers;

		// Can't sarcastic to self
		if (receiver === playerIndex)
			continue;

		const sarcastics = find_sarcastics(state, receiver, newCommon, identity);

		if (sarcastics.some(o => me.thoughts[o].matches(identity, { infer: receiver === state.ourPlayerIndex }))) {
			// The matching card must be the only possible option in the hand to be known sarcastic
			if (sarcastics.length === 1) {
				newCommon = newCommon.withThoughts(sarcastics[0], (draft) => { draft.inferred = state.base_ids.union(identity); });
				logger.info(`writing ${logCard(identity)} from sarcastic discard`);
			}
			else {
				newCommon = apply_unknown_sarcastic(state, newCommon, sarcastics, identity);
				if (locked_discard)
					newCommon = apply_locked_discard(state, newCommon, playerIndex);
			}
			logger.info(`writing sarcastic ${logCard(identity)} on ${state.playerNames[receiver]}'s slot(s) ${sarcastics.map(s => state.hands[receiver].findIndex(o => o === s) + 1)}`);
			newGame.common = newCommon;
			return { newGame, sarcastics };
		}
	}

	logger.warn(`couldn't find a valid target for sarcastic discard`);
	newGame.common = newCommon;
	return { newGame, sarcastics: [] };
}
