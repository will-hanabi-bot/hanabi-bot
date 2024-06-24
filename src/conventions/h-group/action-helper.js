import { CLUE } from '../../constants.js';

import logger from '../../tools/logger.js';
import { logClue } from '../../tools/log.js';

/**
 * @typedef {import('../h-group.js').default} Game
 * @typedef {import('../../basics/State.js').State} State
 * @typedef {import('../../basics/Player.js').Player} Player
 * @typedef {import('../../basics/Card.js').Card} Card
 * @typedef {import('../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../types.js').ClueResult} ClueResult
 * @typedef {import('../../types.js').Clue} Clue
 */

/**
 * Returns the "value" of the clue result. A higher number means that it is more valuable.
 * 
 * A clue must have value >= 1 to meet Minimum Clue Value Principle (MCVP).
 * @param {ClueResult} clue_result
 */
export function find_clue_value(clue_result) {
	const { finesses, new_touched, playables, bad_touch, avoidable_dupe, elim, giver, remainder } = clue_result;

	// Touching 1 card is much better than touching none, but touching more cards is only marginally better
	const new_touched_value = (new_touched.length >= 1) ? 0.51 + 0.1 * (new_touched.length - 1) : 0;

	const precision_value = (new_touched.reduce((acc, c) => acc + c.possible.length, 0) - new_touched.reduce((acc, c) => acc + c.inferred.length, 0)) * 0.01;
	return 0.5*(finesses.length + playables.length) + new_touched_value + 0.01*elim - 1*bad_touch - 0.1*avoidable_dupe + 0.2*giver - 0.1*remainder + precision_value;
}

/**
 * Returns the play clue with the highest value.
 * @param {Clue[]} play_clues
 */
export function select_play_clue(play_clues) {
	let best_clue_value = -99;
	let best_clue;

	for (const clue of play_clues) {
		const clue_value = find_clue_value(clue.result);
		logger.info('clue', logClue(clue), 'value', clue_value);

		if (clue_value > best_clue_value) {
			best_clue_value = clue_value;
			best_clue = clue;
		}
	}

	return { clue: best_clue, clue_value: best_clue_value };
}

/**
 * Given a set of playable cards, returns the unknown 1s in the order that they should be played.
 * @param {State} state
 * @param {Player} player
 * @param {ActualCard[]} cards
 */
export function order_1s(state, player, cards) {
	const unknown_1s = cards.filter(card => card.clues.length > 0 && card.clues.every(clue => clue.type === CLUE.RANK && clue.value === 1));

	return unknown_1s.sort((card1, card2) => {
		const [c1_start, c2_start] = [card1, card2].map(c => state.inStartingHand(c.order));
		const [c1, c2] = [card1, card2].map(c => player.thoughts[c.order]);

		if (c1.finessed && c2.finessed)
			return c1.finesse_index - c2.finesse_index;

		if (c1.finessed)
			return -1;

		if (c2.finessed)
			return 1;

		// c1 is chop focus
		if (c1.chop_when_first_clued)
			return -1;

		// c2 is chop focus
		if (c2.chop_when_first_clued)
			return 1;

		// c1 is fresh 1 (c2 isn't fresh, or fresh but older)
		if (!c1_start && (c2_start || card1.order > card2.order))
			return -1;

		// c1 isn't fresh (c2 also isn't fresh and newer)
		if (c1_start && c2_start && card2.order > card1.order)
			return -1;

		return 1;
	});
}

/**
 * Returns the playable cards categorized by priority.
 * @param {Game} game
 * @param {ActualCard[]} playable_cards
 */
export function determine_playable_card(game, playable_cards) {
	const { state } = game;

	/** @type {Card[][]} */
	const priorities = [[], [], [], [], [], []];

	let min_rank = 5;
	for (const { order } of playable_cards) {
		const card = game.me.thoughts[order];

		// Part of a finesse
		if (card.finessed) {
			priorities[state.numPlayers > 2 ? 0 : 1].push(card);
			continue;
		}

		// Blind playing unknown chop moved cards should be a last resort with < 2 strikes
		if (card.chop_moved && !card.clued && card.possible.some(p => state.playableAway(p) !== 0)) {
			if (state.strikes !== 2)
				priorities[5].push(card);

			continue;
		}

		let priority = 1;
		for (const inference of card.possibilities) {
			const { suitIndex, rank } = inference;

			let connected = false;

			// Start at next player so that connecting in our hand has lowest priority
			for (let i = 1; i < state.numPlayers + 1; i++) {
				const target = (state.ourPlayerIndex + i) % state.numPlayers;
				if (state.hands[target].find(c => game.me.thoughts[c.order].matches({ suitIndex, rank: rank + 1 }, { infer: true }))) {
					connected = true;

					// Connecting in own hand, demote priority to 2
					if (target === state.ourPlayerIndex)
						priority = 2;

					break;
				}
			}

			if (!connected) {
				priority = 3;
				break;
			}
		}

		if (priority < 3) {
			priorities[priority].push(card);
			continue;
		}

		// Find the lowest possible rank for the card
		const rank = card.possibilities.reduce((lowest_rank, card) => card.rank < lowest_rank ? card.rank : lowest_rank, 5);

		// Playing a 5
		if (rank === 5) {
			priorities[3].push(card);
			continue;
		}

		// Unknown card
		if (card.possibilities.length > 1) {
			priorities[4].push(card);
			continue;
		}

		// Other
		if (rank <= min_rank) {
			priorities[5].unshift(card);
			min_rank = rank;
		}
	}

	// Speed-up clues first, then oldest finesse to newest
	priorities[0].sort((c1, c2) => {
		if (c1.hidden && !c2.hidden)
			return 1;

		if (!c1.hidden && c2.hidden)
			return -1;

		return c1.finesse_index - c2.finesse_index;
	});

	return priorities;
}
