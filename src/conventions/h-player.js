import { Card } from '../basics/Card.js';
import { IdentitySet } from '../basics/IdentitySet.js';
import { Player } from '../basics/Player.js';
import { cardValue } from '../basics/hanabi-util.js';
import { CLUE } from '../constants.js';
import { cardTouched, variantRegexes } from '../variants.js';
import { older_queued_finesse } from './h-group/hanabi-logic.js';

import * as Utils from '../tools/util.js';

/**
 * @typedef {import('./h-group.js').default} Game
 * @typedef {import('../basics/State.js').State} State
 * @typedef {import('../types.js').Identity} Identity
 * @typedef {import('../variants.js').Variant} Variant
 */

export class HGroup_Player extends Player {
	/** @param {HGroup_Player} json */
	static fromJSON(json) {
		return new HGroup_Player(json.playerIndex,
			IdentitySet.fromJSON(json.all_possible),
			IdentitySet.fromJSON(json.all_inferred),
			json.hypo_stacks.slice(),
			new Set(json.hypo_plays),
			Utils.objClone(json.hypo_map),
			json.thoughts.map(Card.fromJSON.bind(Card)),
			json.links.map(Utils.objClone),
			json.play_links.map(Utils.objClone),
			new Set(json.unknown_plays),
			Utils.objClone(json.waiting_connections),
			new Map(json.elims));
	}
	/**
	 * Returns the index (0-indexed) of the chop card, or -1 if the hand doesn't have a chop.
	 * @param {number[]} hand
	 */
	chopIndex(hand) {
		for (let i = hand.length - 1; i >= 0; i--) {
			if (this.thoughts[hand[i]].status !== undefined)
				continue;

			return i;
		}
		return -1;
	}

	/**
	 * Returns the chop card, or undefined if the hand doesn't have a chop.
	 * @param {number[]} hand
	 */
	chop(hand) {
		return hand[this.chopIndex(hand)];
	}

	/**
	 * Returns the value of the chop card, 4 if the hand is locked, and 0 if no chop but loaded.
	 * @param {State} state
	 * @param {number} playerIndex
	 * @param {{no_chop?: number}} options
	 */
	chopValue(state, playerIndex, options = {}) {
		const hand = state.hands[playerIndex];
		const chop = this.chop(hand);

		return chop !== undefined ? cardValue(state, this, state.deck[chop], chop) :
			(options.no_chop !== undefined ? options.no_chop :
			(this.thinksLoaded(state, playerIndex) ? 0 : 4));
	}

	/**
	 * Returns the distance that a card is left of chop, ignoring previously-clued cards.
	 * @param {number[]} hand
	 * @param {number} order
	 */
	chopDistance(hand, order) {
		const chop = this.chop(hand);

		let dist = 0, counting = false;

		for (const o of hand) {
			const card = this.thoughts[o];

			if (o === order)
				counting = true;

			if (!counting)
				continue;

			if (o === chop)
				return dist;

			// Skip previously clued cards
			if (card.clued && !card.newly_clued)
				continue;

			dist++;
		}

		throw new Error(`distance from ${order} to chop ${chop} in hand ${hand} was negative!`);
	}

	/**
	 * Returns playables in the given player's hand, according to this player.
	 * @param {State} state
	 * @param {number} playerIndex
	 * @param {{assume?: boolean}} options
	 */
	thinksPlayables(state, playerIndex, options = {}) {
		const playables = super.thinksPlayables(state, playerIndex, options);

		return playables.filter(o => {
			if (!this.thoughts[o].blind_playing)
				return true;

			// Playables that are queued behind a finesse aren't playable
			const queued_behind = older_queued_finesse(state, playerIndex, this, o);
			return queued_behind === undefined;
		});
	}

	/**
	 * Returns all clued card in the hand for the given suitIndex and rank (used for bluffs through clued cards.
	 * @param {State} state
	 * @param {number} playerIndex
	 * @param {Identity} identity
	 * @param {number[]} connected 		Orders of cards that have previously connected
	 * @param {number[]} ignoreOrders 	Orders of cards to ignore when searching.
	 */
	find_clued({ hands, deck, variant }, playerIndex, identity, connected = [], ignoreOrders = []) {
		return hands[playerIndex].filter(o => {
			const { clued, newly_clued, order, clues } = deck[o];
			const { inferred, possible, info_lock } = this.thoughts[o];

			return !connected.includes(order) &&			// not already connected
				clued && !newly_clued && 					// previously clued
				possible.has(identity) &&					// must be a possibility
				(info_lock === undefined || info_lock.has(identity)) &&
				(inferred.length !== 1 || inferred.array[0]?.matches(identity)) && 		// must not be information-locked on a different identity
				clues.some(clue => cardTouched(identity, variant, clue)) &&		// at least one clue matches
				!ignoreOrders.includes(o);
		});
	}

	/**
	 * Finds a prompt in the hand for the given suitIndex and rank, or undefined if no card is a valid prompt.
	 * @param {State} state
	 * @param {number} playerIndex
	 * @param {Identity} identity
	 * @param {number[]} connected 		Orders of cards that have previously connected
	 * @param {number[]} ignoreOrders 	Orders of cards to ignore when searching.
	 * @param {boolean} forcePink 		Whether to force a prompt on a possibly-pink card.
	 */
	find_prompt({ hands, deck, variant }, playerIndex, identity, connected = [], ignoreOrders = [], forcePink = false) {
		const order = hands[playerIndex].find(o => {
			const { clued, newly_clued, order, clues } = deck[o];
			const { inferred, possible, info_lock } = this.thoughts[o];

			return !connected.includes(order) &&			// not already connected
				clued && !newly_clued && 					// previously clued
				possible.has(identity) &&					// must be a possibility
				(info_lock === undefined || info_lock.has(identity)) &&
				(inferred.length !== 1 || inferred.array[0]?.matches(identity)) && 		// must not be information-locked on a different identity
				clues.some(clue => cardTouched(identity, variant, clue)) &&				// at least one clue matches
				(!variantRegexes.pinkish.test(variant.suits[identity.suitIndex]) || forcePink ||	// pink rank match
					possible.every(p => variantRegexes.pinkish.test(variant.suits[p.suitIndex])) ||
					!(clues.every(c1 => clues.every(c2 => c1.type === c2.type && c1.value === c2.value)) &&
						clues.length > 0 &&
						clues[0].type === CLUE.RANK && clues[0].value !== identity.rank));
		});

		return (order !== undefined && !ignoreOrders.includes(order)) ? order : undefined;
	}

	/**
	 * Finds a finesse for the given suitIndex and rank, or undefined if there is none.
	 * @param {State} state
	 * @param {number} playerIndex
	 * @param {number[]} connected 		Orders of cards that have previously connected
	 * @param {number[]} ignoreOrders 	Orders of cards to ignore when searching.
	 */
	find_finesse({ hands }, playerIndex, connected = [], ignoreOrders = []) {
		const order = hands[playerIndex].find(o => !this.thoughts[o].touched && !connected.includes(o));

		return (order !== undefined && !ignoreOrders.includes(order)) ? order : undefined;
	}
}
