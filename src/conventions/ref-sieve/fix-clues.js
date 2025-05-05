import { get_result } from './action-helper.js';
import * as Utils from '../../tools/util.js';

import logger from '../../tools/logger.js';
import { logCard, logClue } from '../../tools/log.js';
import {variantRegexes} from "../../variants.js";
import {unknown_1} from "../h-group/hanabi-logic.js";
import {CLUE} from "../../constants.js";
import {visibleFind} from "../../basics/hanabi-util.js";

/**
 * @typedef {import('../ref-sieve.js').default} Game
 * @typedef {import('../../basics/Card.js').Card} Card
 * @typedef {import('../../types.js').Clue} Clue
 * @typedef {import('../../types.js').ClueAction} ClueAction
 */

/**
 * @param {Game} game
 */
export function find_fix_clue(game) {
	const { state } = game;

	const partner = state.nextPlayerIndex(state.ourPlayerIndex);
	const fix_needed = game.players[partner].thinksPlayables(state, partner, { symmetric: true }).filter(o => !state.isPlayable(state.deck[o]));

	if (fix_needed.length === 0) {
		logger.info('no fix needed');
		return;
	}

	logger.info(`fix needed on [${fix_needed.map(o => logCard(state.deck[o]))}]`);

	const best_clue = Utils.maxOn(state.allValidClues(partner), clue => {
		const action = /** @type {ClueAction} */ (Utils.performToAction(state, Utils.clueToAction(clue, -1), state.ourPlayerIndex, state.deck));
		const hypo_game = game.simulate_clue(action);
		const value = get_result(game, hypo_game, action);

		const fixed = fix_needed.some(o => {
			const actual = hypo_game.state.deck[o];
			const card = hypo_game.common.thoughts[o];
			return card.inferred.has(actual) || card.inferred.length === 0 || card.reset;
		});

		if (fixed)
			logger.info('clue', logClue(clue), 'fixes with value', value);

		return fixed ? value : -9999;
	}, -9999);

	if (best_clue === undefined)
		logger.warn('Unable to find fix clue!');

	return best_clue;
}

/**
 * @template {Game} T
 * @param {T} game
 * @param {Card[]} oldThoughts
 * @param {ClueAction} clueAction
 * @returns {{ resets: number[], duplicate_reveal: number[], rewinded: boolean, newGame: T }}
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
				common.hypo_stacks.some(stack => stack === 0) &&
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
				return { resets: [], duplicate_reveal: [], rewinded: true, newGame };
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

	const resets = Array.from(all_resets);
	if (resets.length > 0)
		logger.info('cards', resets, 'were newly reset!');

	const duplicate_reveal = list.filter(order => {
		const card = newCommon.thoughts[order];

		// No new eliminations
		if (card.possible.length === oldThoughts[order].possible.length)
			return false;

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
	return { resets, duplicate_reveal, rewinded: false, newGame };
}
