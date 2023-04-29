import { CLUE, ACTION } from '../../../constants.js';
import { LEVEL } from '../h-constants.js';
import { clue_safe, save2 } from './clue-safe.js';
import { find_fix_clues } from './fix-clues.js';
import { determine_clue, direct_clues } from './determine-clue.js';
import { find_chop, determine_focus, stall_severity } from '../hanabi-logic.js';
import { isBasicTrash, isCritical, isSaved, isTrash, visibleFind } from '../../../basics/hanabi-util.js';
import logger from '../../../logger.js';
import * as Utils from '../../../util.js';

/**
 * @typedef {import('../../h-group.js').default} State
 * @typedef {import('../../../basics/Card.js').Card} Card
 * @typedef {import('../../../types.js').Clue} Clue
 */

/**
 * Finds a save clue (if necessary) for the given card in the target's hand.
 * @param {State} state
 * @param {number} target
 * @param {Card} card
 * @returns {Clue | undefined} The save clue if necessary, otherwise undefined.
 */
function find_save(state, target, card) {
	const { suitIndex, rank } = card;

	if (isBasicTrash(state, suitIndex, rank)) {
		return;
	}

	// Save a delayed playable card that isn't visible somewhere else
	if (state.hypo_stacks[suitIndex] + 1 === rank &&
		visibleFind(state, state.ourPlayerIndex, suitIndex, rank).length === 1
	) {
		return determine_clue(state, target, card, { save: true });
	}

	if (isCritical(state, suitIndex, rank)) {
		logger.warn('saving critical card', Utils.logCard(card));
		if (rank === 5) {
			return { type: ACTION.RANK, value: 5, target };
		}
		else {
			// The card is on chop, so it can always be focused
			return determine_clue(state, target, card, { save: true });
		}
	}
	else if (save2(state, target, card)) {
		return { type: ACTION.RANK, value: 2, target };
	}
	return;
}

/**
 * Finds a Trash Chop Move (if valid) using the given trash card in the target's hand.
 * @param {State} state
 * @param {number} target
 * @param {Card[]} saved_cards
 * @param {Card} trash_card
 * @returns {Clue | undefined} The TCM if valid, otherwise undefined.
 */
function find_tcm(state, target, saved_cards, trash_card) {
	logger.info(`attempting tcm with trash card ${Utils.logCard(trash_card)}, saved cards ${saved_cards.map(c => Utils.logCard(c)).join(',')}`);
	const chop = saved_cards.at(-1);

	// Colour or rank save (if possible) is preferred over trash chop move
	// TODO: Can save variant cards together (like rainbow)
	if ((isCritical(state, chop.suitIndex, chop.rank) || save2(state, target, chop)) &&
		(saved_cards.every(c => c.suitIndex === chop.suitIndex) || saved_cards.every(c => c.rank === chop.rank))
	) {
		logger.info('prefer direct save');
		return;
	}
	else if (isTrash(state, state.ourPlayerIndex, chop.suitIndex, chop.rank, chop.order) ||
		saved_cards.some(c => c.matches(chop.suitIndex, chop.rank) && c.order !== chop.order)	// A duplicated card is also trash
	) {
		logger.info('chop is trash, can give tcm later');
		return;
	}

	const saved_trash = saved_cards.filter(card => {
		const {suitIndex, rank, order} = card;

		return isTrash(state, state.ourPlayerIndex, suitIndex, rank, order) ||					// Saving a trash card
			saved_cards.some(c => card.matches(c.suitIndex, c.rank) && card.order > c.order);	// Saving 2 of the same card
	}).map(c => Utils.logCard(c));

	logger.info(`would save ${saved_trash.length === 0 ? 'no' : saved_trash.join()} trash`);

	// There has to be more useful cards saved than trash cards
	if (saved_trash.length <= 1 && (saved_cards.length - saved_trash.length) > saved_trash.length) {
		const possible_clues = direct_clues(state, target, trash_card);

		const tcm = possible_clues.find(clue => {
			// Ensure that the card will become known trash
			if (clue.type === CLUE.COLOUR) {
				if (state.play_stacks[clue.value] !== state.max_ranks[clue.value]) {
					return false;
				}
			}
			else if (clue.type === CLUE.RANK) {
				for (let i = 0; i < state.suits.length; i++) {
					// Could be a useful card
					if (state.play_stacks[i] < clue.value && state.max_ranks[i] >= clue.value) {
						return false;
					}
				}
			}

			return true;

			// Card doesn't need to be focused?
			// const touch = state.hands[target].clueTouched(state.suits, clue);
			// const { focused_card } = determine_focus(state.hands[target], touch.map(c => c.order), { beforeClue: true });

			// return focused_card.order === trash_card.order;
		});

		if (tcm !== undefined) {
			// Convert CLUE to ACTION
			return { type: tcm.type + 2, value: tcm.value, target };
		}
	}
	return;
}

/**
 * Finds a 5's Chop Move (if valid) with the given chop moved card in the target's hand.
 * @param {State} state
 * @param {number} target
 * @param {Card} chop
 * @returns {Clue | undefined} The 5CM if valid, otherwise undefined.
 */
function find_5cm(state, target, chop) {
	const { suitIndex, rank, order } = chop;
	const clue = { type: CLUE.RANK, value: 5, target };

	// The card to be chop moved is useful and not clued/finessed/chop moved elsewhere
	if (rank > state.hypo_stacks[suitIndex] && rank <= state.max_ranks[suitIndex] &&
		!isSaved(state, state.ourPlayerIndex, suitIndex, rank, order) && clue_safe(state, clue)
	) {
		return { type: ACTION.RANK, value: 5, target };
	}

	return;
}

/**
 * Finds all play, save and fix clues for the given state.
 * Play and fix clues are 2D arrays as each player can potentially receive multiple play/fix clues.
 * Each player has only one save clue.
 * 
 * The 'ignorePlayerIndex' option skips finding clues for a particular player.
 * 
 * The 'ignoreCM' option prevents looking for save clues that cause chop moves.
 * @param {State} state
 * @param {{ignorePlayerIndex?: number, ignoreCM?: boolean}} options
 */
export function find_clues(state, options = {}) {
	/** @type Clue[][] */
	const play_clues = [];
	/** @type Clue[] */
	const save_clues = [];

	logger.info('play/hypo/max stacks in clue finder:', state.play_stacks, state.hypo_stacks, state.max_ranks);

	// Find all valid clues
	for (let target = 0; target < state.numPlayers; target++) {
		play_clues[target] = [];
		save_clues[target] = undefined;

		// Ignore our own hand
		if (target === state.ourPlayerIndex || target === options.ignorePlayerIndex) {
			continue;
		}

		const hand = state.hands[target];
		const chopIndex = find_chop(hand);

		let found_tcm = false, tried_5cm = false;
		const severity = stall_severity(state, state.ourPlayerIndex);

		for (let cardIndex = hand.length - 1; cardIndex >= 0; cardIndex--) {
			const card = hand[cardIndex];
			const { suitIndex, rank, finessed } = card;
			const duplicates = visibleFind(state, state.ourPlayerIndex, suitIndex, rank);

			// Ignore finessed cards (do not ignore cm'd cards), cards visible elsewhere, or cards possibly part of a finesse
			if (finessed || duplicates.some(c => (c.clued || c.finessed) && (c.order !== card.order)) ||
				state.waiting_connections.some(c => suitIndex === c.inference.suitIndex && rank <= c.inference.rank)) {
				continue;
			}

			// Save clue
			if (cardIndex === chopIndex) {
				save_clues[target] = find_save(state, target, card);
			}

			let interpreted_5cm = false;

			if (state.level >= LEVEL.BASIC_CM && !options.ignoreCM) {
				// Trash card (not conventionally play)
				if (isBasicTrash(state, suitIndex, rank)) {
					// Trash chop move (we only want to find the rightmost tcm)
					if (!(card.clued || card.chop_moved) && cardIndex !== chopIndex && !found_tcm) {
						const saved_cards = hand.slice(cardIndex + 1).filter(c => !(c.clued || c.chop_moved));
						// Use original save clue if tcm not found
						save_clues[target] = find_tcm(state, target, saved_cards, card) ?? save_clues[target];
						found_tcm = true;
						logger.info('--------');
					}
					// TODO: Eventually, trash bluff/finesse/push?
					continue;
				}

				// 5's chop move (only search once, on the rightmost unclued 5 that's not on chop)
				if (!tried_5cm && rank === 5 && !(card.clued || card.chop_moved)) {
					logger.info('trying 5cm with 5 at index', cardIndex);
					tried_5cm = true;

					// Can only perform a 5cm at severity 0 (otherwise, looks like 5 stall)
					// Allow giving direct 5 clues when every hypo stack is at 4 or above
					if (severity === 0 && !state.hypo_stacks.every(stack => stack >= 4)) {
						// Find where chop is, relative to the rightmost clued 5
						let distance_from_chop = 0;
						for (let j = cardIndex; j < chopIndex; j++) {
							// Skip clued cards
							if (hand[j].clued) {
								continue;
							}
							distance_from_chop++;
						}

						if (distance_from_chop === 1) {
							// Use original save clue (or look for play clue) if 5cm not found
							save_clues[target] = find_5cm(state, target, hand[chopIndex]) ?? save_clues[target];
							logger.info('found 5cm');
							interpreted_5cm = true;
						}
						else {
							logger.info(`rightmost 5 is ${distance_from_chop} from chop, cannot 5cm`);
						}
					}
					else {
						logger.info(`looks like stall or direct play`);
					}
				}
			}

			// Play clue
			const clue = determine_clue(state, target, card, { excludeRank: interpreted_5cm });
			if (clue !== undefined) {
				// Not a play clue
				if (clue.result.playables.length === 0) {
					if (cardIndex !== chopIndex) {
						logger.info(`found clue ${Utils.logClue(clue)} that wasn't a save/tcm/5cm/play.`);
					}
					logger.info('--------');
					continue;
				}

				play_clues[target].push(clue);
			}
			logger.info('--------');
		}
	}

	const fix_clues = find_fix_clues(state, play_clues, save_clues, options);

	logger.info('found play clues', play_clues.map(clues => clues.map(clue => Utils.logClue(clue))));
	logger.info('found save clues', save_clues.map(clue => Utils.logClue(clue)));
	logger.info('found fix clues', fix_clues.map(clues => clues.map(clue => Utils.logClue(clue))));
	return { play_clues, save_clues, fix_clues };
}
