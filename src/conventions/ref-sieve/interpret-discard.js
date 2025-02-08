import { team_elimP } from '../../basics/helper.js';
import { find_sarcastics, interpret_sarcastic } from '../shared/sarcastic.js';
import * as Basics from '../../basics.js';

import logger from '../../tools/logger.js';
import { logCard } from '../../tools/log.js';

/**
 * @typedef {import('../ref-sieve.js').default} Game
 * @typedef {import('../../basics/Player.js').Player} Player
 * @typedef {import('../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../types.js').Identity} Identity
 * @typedef {import('../../types.js').DiscardAction} DiscardAction
 */

/**
 * Interprets a sarcastic discard.
 * @param {Game} game
 * @param {DiscardAction} discardAction
 */
export function interpret_rs_sarcastic(game, discardAction) {
	const { common, me, state } = game;
	const { playerIndex, suitIndex, rank } = discardAction;
	const identity = { suitIndex, rank };

	let newCommon = common;

	if (!state.isPlayable(identity))
		({ common: newCommon } = interpret_sarcastic(game, discardAction).newGame);

	// Sarcastic discard to other (or known sarcastic discard to us)
	for (let i = 0; i < state.numPlayers; i++) {
		const receiver = (state.ourPlayerIndex + i) % state.numPlayers;

		// Can't sarcastic to self
		if (receiver === playerIndex)
			continue;

		const sarcastics = find_sarcastics(state, receiver, newCommon, identity);
		const sarcastic_target = Math.min(...sarcastics);

		if (sarcastics.length > 0 && me.thoughts[sarcastic_target].matches(identity, { infer: receiver === state.ourPlayerIndex })) {
			newCommon = newCommon.withThoughts(sarcastics[0], (draft) => { draft.inferred = state.base_ids.union(identity); });
			logger.info(`writing ${logCard(identity)} from sarcastic discard`);
			return { newCommon, sarcastics: [sarcastic_target] };
		}
	}

	const sarcastics = find_sarcastics(state, state.ourPlayerIndex, me, identity);
	const sarcastic_target = Math.min(...sarcastics);

	if (sarcastics.length > 0) {
		newCommon = newCommon.withThoughts(sarcastic_target, (common_sarcastic) => {
			common_sarcastic.inferred = state.base_ids.union(identity);
			common_sarcastic.trash = false;
		});
		logger.info(`writing sarcastic ${logCard(identity)} on slot ${state.ourHand.findIndex(o => o === sarcastic_target) + 1}`);
		return { newCommon, sarcastics: [sarcastic_target] };
	}

	logger.warn(`couldn't find a valid target for sarcastic discard`);
	return { newCommon, sarcastics: [] };
}

/**
 * Interprets (writes notes) for a discard of the given card.
 * 
 * Impure!
 * @template {Game} T
 * @param {T} game
 * @param {DiscardAction} action
 */
export function interpret_discard(game, action) {
	let { common, state } = game;
	const { order, playerIndex, suitIndex, rank, failed } = action;
	const identity = { suitIndex, rank };

	let newGame = Basics.onDiscard(game, action);
	({ common, state } = newGame);

	// Discarding a useful card
	if (state.deck[order].clued && rank > state.play_stacks[suitIndex] && rank <= state.max_ranks[suitIndex]) {
		logger.warn('discarded useful card!');
		common = common.restore_elim(state.deck[order]);

		// Card was bombed
		if (failed)
			common = common.undo_hypo_stacks(identity);
		else
			common = interpret_rs_sarcastic(game, action).newCommon;
	}

	if (state.numPlayers === 2) {
		const partner = state.nextPlayerIndex(playerIndex);

		// Discarding while partner is locked and having a playable card
		if (common.thinksLocked(state, partner)) {
			const playables = common.thinksPlayables(state, playerIndex);

			for (const order of playables)
				newGame.locked_shifts[order] = (newGame.locked_shifts[order] ?? 0) + 1;
		}

		// No safe action, chop has permission to discard
		if (!common.thinksLoaded(state, partner) && !state.hands[partner].some(o => common.thoughts[o].called_to_discard)) {
			common = common.withThoughts(state.hands[partner][0], (chop) => {
				chop.permission_to_discard = true;
			});
		}
	}
	else {
		for (const o of state.hands[playerIndex]) {
			if (common.thoughts[o].called_to_discard) {
				common = common.withThoughts(o, (draft) => {
					draft.called_to_discard = false;
				});
			}
		}
	}

	newGame.common = common.good_touch_elim(state).refresh_links(state);
	newGame = team_elimP(newGame);

	Basics.mutate(game, newGame);
	return newGame;
}
