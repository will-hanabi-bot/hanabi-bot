import { CARD_STATUS } from '../../basics/Card.js';
import * as Utils from '../../tools/util.js';

import logger from '../../tools/logger.js';
import { logCard } from '../../tools/log.js';

/**
 * @typedef {import('../../basics/Game.js').Game} Game
 * @typedef {import('../../basics/State.js').State} State
 * @typedef {import('../../basics/Player.js').Player} Player
 * @typedef {import('../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../types.js').Identity} Identity
 * @typedef {import('../../basics/Action.ts').DiscardAction} DiscardAction
 */

/**
 * Interprets a gentleman's discard.
 * 
 * Impure! (modifies common)
 * @param {Game} game
 * @param {DiscardAction} discardAction
 * @param {(state: State, playerIndex: number, connected?: number[]) => number} find_finesse
 * @returns {number[]} 					The target(s) for the gentleman's discard
 */
export function interpret_gd(game, discardAction, find_finesse) {
	const { common, state } = game;
	const { playerIndex, suitIndex, rank } = discardAction;
	const identity = { suitIndex, rank };

	/** @param {number} index */
	const gd_target = (index) => {
		/** @param {number} order */
		const matches = (order) =>
			state.deck[order].matches(identity) ||
			(index === state.ourPlayerIndex && state.deck[order].identity() === undefined && common.thoughts[order].possible.has(identity));

		let finesse = find_finesse(state, index);

		if (finesse !== undefined && matches(finesse))
			return [{ order: finesse, ids: [identity] }];

		const finessed = /** @type {{ order: number, ids: Identity[] }[]} */ ([]);
		const hypo_state = state.shallowCopy();
		hypo_state.play_stacks = state.play_stacks.slice();

		while (finesse !== undefined && hypo_state.isPlayable(state.deck[finesse])) {
			finessed.push({ order: finesse, ids: hypo_state.play_stacks.map((stack, suitIndex) => ({ suitIndex, rank: stack + 1 })) });
			hypo_state.play_stacks[state.deck[finesse].suitIndex]++;

			finesse = find_finesse(state, index, finessed.map(e => e.order));
			if (finesse !== undefined && matches(finesse))
				return finessed.concat({ order: finesse, ids: [identity] });
		}

		return [];
	};

	// Discarder cannot gd to themselves, and we always try to assume on others before self.
	const player_precedence = Utils.range(0, state.numPlayers).filter(i => i !== state.ourPlayerIndex).concat(state.ourPlayerIndex).filter(i => i !== playerIndex);
	const target = player_precedence.map(i => ({ i, targets: gd_target(i) })).find(({ targets }) => targets.length > 0);

	if (target === undefined) {
		logger.warn(`couldn't find a valid target for gentleman's discard`);
		return [];
	}

	const { i, targets } = target;

	// Could be layered if there is an older unclued card that could match
	const maybe_layered = targets.length > 0 || (state.hands[i].some(o =>
		o < targets[0].order && !common.thoughts[o].touched && game.players[i].thoughts[o].possible.has(identity)));

	for (const { order, ids } of targets) {
		common.updateThoughts(order, (draft) => {
			if (order === targets.at(-1).order) {
				draft.inferred = common.thoughts[order].inferred.intersect(identity);
			}
			else {
				draft.inferred = common.thoughts[order].inferred.intersect(ids);
				draft.hidden = true;
			}

			draft.updateStatus(CARD_STATUS.GD);
			draft.trash = false;

			if (maybe_layered) {
				draft.maybe_layered = true;
				draft.finesse_ids = state.base_ids.union(ids);
			}
			else {
				draft.known = true;
			}
		});
	}

	logger.highlight('yellow', `writing ${logCard(identity)} from gentleman's discard on ${targets.map(t => t.order)} ${state.playerNames[i]}`);
	return targets.map(t => t.order);
}

/**
 * Interprets a baton discard.
 * 
 * Impure! (modifies common)
 * @param {Game} game
 * @param {DiscardAction} discardAction
 * @param {(state: State, playerIndex: number) => number[]} baton_targets
 * @returns {number[]} 					The target(s) for the baton discard
 */
export function interpret_baton(game, discardAction, baton_targets) {
	const { common, state } = game;
	const { playerIndex, suitIndex, rank } = discardAction;
	const identity = { suitIndex, rank };

	/** @param {number} index */
	const baton_target = (index) =>
		baton_targets(state, index).filter(order =>
			state.deck[order].matches(identity) ||
			(index === state.ourPlayerIndex && state.deck[order].identity() === undefined && common.thoughts[order].possible.has(identity)));

	// Discarder cannot baton to themselves, and we always try to assume on others before self.
	const player_precedence = Utils.range(0, state.numPlayers).filter(i => i !== state.ourPlayerIndex).concat(state.ourPlayerIndex).filter(i => i !== playerIndex);
	const orders = player_precedence.map(baton_target).find(orders => orders.length > 0) ?? [];

	if (orders.length === 0) {
		logger.warn(`couldn't find a valid target for baton discard`);
		return [];
	}

	if (orders.length > 1) {
		// Unknown baton location
		for (const order of orders) {
			common.updateThoughts(order, (draft) => {
				draft.inferred = common.thoughts[order].inferred.union(identity);
				draft.trash = false;
			});
		}
	}
	else {
		common.updateThoughts(orders[0], (draft) => {
			draft.inferred = common.thoughts[orders[0]].inferred.intersect(identity);
			draft.known = true;
			draft.trash = false;
		});
	}

	logger.highlight('yellow', `writing ${logCard(identity)} from baton discard on ${state.playerNames[state.hands.findIndex(hand => hand.includes(orders[0]))]}`);
	return orders;
}
