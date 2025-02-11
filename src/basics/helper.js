import { CLUE } from '../constants.js';
import { variantRegexes } from '../variants.js';
import { visibleFind } from './hanabi-util.js';
import { unknown_1 } from '../conventions/h-group/hanabi-logic.js';

import logger from '../tools/logger.js';
import { logCard } from '../tools/log.js';
import { applyPatches, produce } from '../StateProxy.js';

/**
 * @typedef {import('./Game.js').Game} Game
 * @typedef {import('./State.js').State} State
 * @typedef {import('./Player.js').Player} Player
 * @typedef {import('./Card.js').Card} Card
 * @typedef {import('./Card.js').BasicCard} BasicCard
 * @typedef {import('../types.js').BaseClue} BaseClue
 * @typedef {import('../types.js').Clue} Clue
 * @typedef {import('../types.js').Identity} Identity
 * @typedef {import('../types.js').ClueAction} ClueAction
 * @typedef {import('../variants.js').Variant} Variant
 */

/**
 * Updates all players with info from common knowledge.
 * @param {Game} game
 * @param {boolean} [good_touch]
 */
export function team_elim(game, good_touch = true) {
	const { common, state } = game;

	for (const player of game.players) {
		for (const [order, patches] of common.patches) {
			const { possible, inferred } = common.thoughts[order];
			const { possible: player_possible } = player.thoughts[order];

			player.updateThoughts(order, (draft) => {
				applyPatches(draft, patches.filter(p => p.path[0] !== 'possible' && p.path[0] !== 'inferred'));
				draft.possible = possible.intersect(player_possible);
				draft.inferred = inferred.intersect(player_possible);
			}, false);
		}

		player.waiting_connections = common.waiting_connections.slice();
		Object.assign(player, player[good_touch ? 'good_touch_elim' : 'card_elim'](state, state.numPlayers === 2).refresh_links(state).update_hypo_stacks(state));
	}

	common.patches = new Map();
}

/**
 * Updates all players with info from common knowledge.
 * @template {Game} T
 * @param {T} game
 * @param {boolean} [good_touch]
 */
export function team_elimP(game, good_touch = true) {
	const { common, state } = game;

	const newPlayers = game.players.map(player => produce(player, (draft) => {
		for (const [order, patches] of common.patches) {
			const { possible, inferred } = common.thoughts[order];
			const { possible: player_possible } = player.thoughts[order];

			applyPatches(draft.thoughts[order], patches.filter(p => p.path[0] !== 'possible' && p.path[0] !== 'inferred'));
			draft.thoughts[order].possible = possible.intersect(player_possible);
			draft.thoughts[order].inferred = inferred.intersect(player_possible);
		}
		draft.waiting_connections = common.waiting_connections.slice();
	})[good_touch ? 'good_touch_elim' : 'card_elim'](state, state.numPlayers === 2).refresh_links(state).update_hypo_stacks(state));

	const newGame = game.shallowCopy();
	newGame.players = newPlayers;
	newGame.common = produce(common, (draft) => { draft.patches = new Map(); });

	return newGame;
}

/**
 * @template {Game} T
 * @param {T} game
 * @param {Card[]} oldThoughts
 * @param {ClueAction} clueAction
 * @returns {{ clued_resets: number[], duplicate_reveal: number[], rewinded: boolean, newGame: T }}
 */
export function checkFix(game, oldThoughts, clueAction) {
	const { clue, giver, list, target } = clueAction;
	const { common, state } = game;

	let newCommon = common;

	/** @type {Set<number>} */
	const clue_resets = new Set();
	for (const order of state.hands[target]) {
		const clued_reset = (oldThoughts[order].inferred.length > 0 && newCommon.thoughts[order].inferred.length === 0) ||
			(list.includes(order) && state.includesVariant(variantRegexes.pinkish) &&
				!oldThoughts[order].focused &&		// Do not allow pink fix on focused cards
				unknown_1(oldThoughts[order]) &&
				clue.type === CLUE.RANK && clue.value !== 1);

		if (clued_reset) {
			newCommon.thoughts = newCommon.thoughts.with(order, newCommon.thoughts[order].reset_inferences());
			clue_resets.add(order);
		}
	}

	//common.good_touch_elim(state);
	newCommon = newCommon.refresh_links(state);

	// Includes resets from negative information
	const all_resets = new Set(clue_resets);

	if (all_resets.size > 0) {
		const reset_order = Array.from(all_resets).find(order =>
			!newCommon.thoughts[order].rewinded &&
			newCommon.thoughts[order].possible.length === 1 && newCommon.dependentConnections(order).length > 0);

		// There is a waiting connection that depends on this card
		if (reset_order !== undefined) {
			const reset_card = newCommon.thoughts[reset_order];
			const newGame = game.rewind(reset_card.drawn_index + 1, [{
				type: 'identify',
				order: reset_order,
				playerIndex: state.hands.findIndex(hand => hand.includes(reset_order)),
				identities: [reset_card.possible.array[0].raw()]
			}]);

			if (newGame !== undefined) {
				newGame.notes = newGame.updateNotes();
				return { clued_resets: [], duplicate_reveal: [], rewinded: true, newGame };
			}
		}

		// TODO: Support undoing recursive eliminations by keeping track of which elims triggered which other elims
		const infs_to_recheck = [];

		for (const order of all_resets) {
			const old_id = oldThoughts[order].identity({ infer: true });

			if (old_id !== undefined) {
				infs_to_recheck.push(old_id);

				newCommon.hypo_stacks[old_id.suitIndex] = Math.min(newCommon.hypo_stacks[old_id.suitIndex], old_id.rank - 1);
				logger.info('setting hypo stacks to', newCommon.hypo_stacks);

				const id_hash = logCard(old_id);
				const elims = newCommon.elims.get(id_hash);

				// Don't allow the card being reset to regain this inference
				if (elims && elims.includes(order))
					elims.splice(elims.indexOf(order), 1);
			}
		}

		for (const inf of infs_to_recheck)
			newCommon = newCommon.restore_elim(inf);
	}

	// Any clued cards that lost all inferences
	const clued_resets = list.filter(order => all_resets.has(order) && !state.deck[order].newly_clued);

	if (clued_resets.length > 0)
		logger.info('clued cards', clued_resets, 'were newly reset!');

	const duplicate_reveal = list.filter(order => {
		const card = newCommon.thoughts[order];

		if (newCommon.thoughts[order].identity() === undefined || card.clues.filter(clue => clue.type === card.clues.at(-1).type && clue.value === card.clues.at(-1).value ).length > 1)
			return false;

		// The fix can be in anyone's hand except the giver's
		const copy = visibleFind(state, newCommon, card.identity(), { ignore: [giver], infer: true })
			.find(o => newCommon.thoughts[o].touched && o !== order);// && !c.newly_clued);

		if (copy)
			logger.info('duplicate', logCard(card.identity()), 'revealed! copy of order', copy, card.possible.map(logCard));

		return copy !== undefined;
	});

	const newGame = game.shallowCopy();
	newGame.common = newCommon;
	return { clued_resets, duplicate_reveal, rewinded: false, newGame };
}

/**
 * Resets superposition on all cards.
 * @param {Game} game
 */
export function reset_superpositions(game) {
	let newCommon = game.common;

	for (const order of game.state.hands.flat())
		newCommon = newCommon.withThoughts(order, (draft) => { draft.superposition = false; });

	return newCommon;
}

/**
 * @param {Game} game
 * @param {number} start
 * @param {number} target
 * @param {Identity} [identity]		The identity we want to make playable (if undefined, any identity).
 * @returns {boolean} 				Whether the target's hand becomes playable.
 */
export function connectable_simple(game, start, target, identity) {
	if (identity !== undefined && game.state.isPlayable(identity))
		return true;

	if (start === target)
		return game.players[target].thinksPlayables(game.state, target, { assume: false }).length > 0;

	const playables = game.players[start].thinksPlayables(game.state, start, { assume: false });

	for (const order of playables) {
		const id = game.players[start].thoughts[order].identity({ infer: true });

		if (id === undefined)
			continue;

		const new_game = produce(game, (draft) => {
			draft.state.play_stacks[id.suitIndex]++;
		});

		if (connectable_simple(new_game, game.state.nextPlayerIndex(start), target, identity))
			return true;
	}
	return connectable_simple(game, game.state.nextPlayerIndex(start), target, identity);
}

/**
 * Returns whether a clue was a distribution clue.
 * @param {Game} game
 * @param {ClueAction} action
 * @param {number} focus
 */
export function distribution_clue(game, action, focus) {
	const { common, me, state } = game;
	const { list, target } = action;
	const focus_thoughts = common.thoughts[focus];

	if ((!state.inEndgame() && state.maxScore - state.score > state.variant.suits.length) || !list.some(o => state.deck[o].newly_clued))
		return false;

	const id = focus_thoughts.identity({ infer: true });
	if (id !== undefined && state.isBasicTrash(id))
		return false;

	let all_trash = true, possibly_useful = false;

	for (const p of focus_thoughts.possible) {
		if (state.isBasicTrash(p))
			continue;

		const duplicated = state.hands.some((hand, i) => i !== target && hand.some(o => common.thoughts[o].touched && me.thoughts[o].matches(p), { infer: true }));

		if (duplicated)
			possibly_useful = true;
		else
			all_trash = false;
	}

	return all_trash && possibly_useful;
}
