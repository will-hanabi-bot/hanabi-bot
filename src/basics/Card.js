import { IdentitySet } from './IdentitySet.js';
import * as Utils from '../tools/util.js';
import { logCard } from '../tools/log.js';
import { produce } from '../StateProxy.js';
import logger from '../tools/logger.js';

/**
 * @typedef {{infer?: boolean, symmetric?: boolean, assume?: boolean}} MatchOptions
 * @typedef {import('../types.js').BaseClue} BaseClue
 * @typedef {import('../types.js').Identity} Identity
 */

export class BasicCard {
	/**
	 * @param {number} [suitIndex]	The index of the card's suit
	 * @param {number} [rank]		The rank of the card
	 */
	constructor(suitIndex, rank) {
		this.suitIndex = suitIndex;
		this.rank = rank;
	}

	/** @param {BasicCard} json */
	static fromJSON(json) {
		return new BasicCard(json.suitIndex, json.rank);
	}

	raw() {
		return Object.freeze({ suitIndex: this.suitIndex, rank: this.rank });
	}

	identity() {
		if (this.suitIndex !== -1 && this.rank !== -1)
			return new BasicCard(this.suitIndex, this.rank);
	}

	matches({ suitIndex, rank }) {
		return this.suitIndex === suitIndex && this.rank === rank;
	}

	/**
	 * Returns whether the card would be played on the stacks before the given identity.
	 * Always returns false if the two cards are of different suits.
	 * @param {Identity} identity
	 * @param {{ equal?: boolean }} options
	 */
	playedBefore({ suitIndex, rank }, options = {}) {
		return this.suitIndex === suitIndex && (options.equal ? (this.rank <= rank) : (this.rank < rank));
	}
}

export class ActualCard extends BasicCard {
	/**
	 * @param {number} suitIndex	The index of the card's suit
	 * @param {number} rank			The rank of the card
	 * @param {number} [order]		The order of the card in the deck
	 * @param {number} [drawn_index]
	 * @param {boolean} [clued]
	 * @param {boolean} [newly_clued]
	 * @param {(BaseClue & { giver: number, turn: number })[]} [clues]	List of clues that have touched this card
	 */
	constructor(suitIndex, rank, order = -1, drawn_index = -1, clued = false, newly_clued = false, clues = []) {
		super(suitIndex, rank);

		this.order = order;
		this.drawn_index = drawn_index;
		this.clued = clued;
		this.newly_clued = newly_clued;
		this.clues = clues;
	}

	/** @param {ActualCard} json */
	static fromJSON(json) {
		return new ActualCard(json.suitIndex, json.rank, json.order, json.drawn_index, json.clued, json.newly_clued, json.clues.slice());
	}

	clone() {
		return this.shallowCopy();
	}

	shallowCopy() {
		return new ActualCard(this.suitIndex, this.rank, this.order, this.drawn_index, this.clued, this.newly_clued, this.clues.slice());
	}

	/**
	 * Checks if the card matches the provided identity.
	 * @param {Identity} identity
	 * @param {{assume?: boolean}} options
	 */
	matches({ suitIndex, rank }, options = {}) {
		if (this.identity() === undefined)
			return options.assume ?? false;

		return this.suitIndex === suitIndex && this.rank === rank;
	}

	/**
	 * Returns whether the card is a duplicate of the provided card (same suitIndex and rank, different order).
	 * @param {ActualCard} card
	 */
	duplicateOf(card) {
		return this.matches(card) && this.order !== card.order;
	}
}

/**
 * Class for a single card (i.e. a suitIndex and rank). Other attributes are optional.
 */
export class Card extends ActualCard {
	/**
	 * All possibilities of the card (from positive/negative information).
	 * @type {IdentitySet}
	 */
	possible;

	/**
	 * All inferences of the card (from conventions).
	 * @type {IdentitySet}
	 */
	inferred;

	/**
	 * All possibilities of the card (from future information).
	 * @type {Identity[] | undefined}
	 */
	rewind_ids;

	/**
	 * All finesse possibilities of the card (hidden if this card is not finessed).
	 * @type {IdentitySet | undefined}
	 */
	finesse_ids;

	/**
	 * Only used when undoing a finesse and after a card has been revealed.
	 * @type {IdentitySet | undefined}
	 */
	old_inferred;

	/**
	 * Only used after a card has been revealed.
	 * @type {IdentitySet | undefined}
	 */
	old_possible;

	/**
	 * The identities that are locked onto the card.
	 * @type {IdentitySet | undefined}
	 */
	info_lock;

	// Boolean flags about the state of the card
	focused = false;
	finessed = false;
	possibly_finessed = false;
	bluffed = false;
	possibly_bluffed = false;
	trash_pushed = false;
	chop_moved = false;
	reset = false;			// Whether the card has previously lost all inferences
	chop_when_first_clued = false;
	was_cm = false;
	superposition = false;	// Whether the card is currently in a superposition
	hidden = false;
	called_to_play = false;
	called_to_discard = false;
	permission_to_discard = false;
	certain_finessed = false;
	trash = false;
	uncertain = false;
	known = false;

	/** @type {{ giver: number, turn: number }} */
	firstTouch;

	finesse_index = -1;	// Action index of when the card was finessed
	reasoning_turn = /** @type {number[]} */ ([]);	// The game turns of when the card's possibilities/inferences were updated
	rewinded = false;								// Whether the card has ever been rewinded

	/**
	 * @param {number} suitIndex	The index of the card's suit
	 * @param {number} rank			The rank of the card
	 * @param {IdentitySet} possible
	 * @param {IdentitySet} inferred
	 * @param {number} [order]		The order of the card in the deck
	 * @param {number} [drawn_index]
	 * @param {boolean} [clued]
	 * @param {boolean} [newly_clued]
	 * @param {(BaseClue & { giver: number, turn: number })[]} [clues]	List of clues that have touched this card
	 */
	constructor(suitIndex, rank, possible, inferred, order = -1, drawn_index = -1, clued = false, newly_clued = false, clues = []) {
		super(suitIndex, rank, order, drawn_index, clued, newly_clued, clues);
		this.possible = possible;
		this.inferred = inferred;
	}

	/** @param {Card} json */
	static fromJSON(json) {
		const res = new Card(json.suitIndex, json.rank, IdentitySet.fromJSON(json.possible), IdentitySet.fromJSON(json.inferred));

		for (const property of Object.getOwnPropertyNames(res)) {
			if (json[property] === undefined)
				continue;

			switch (property) {
				case 'finesse_ids':
				case 'old_inferred':
				case 'old_possible':
				case 'inferred':
				case 'possible':
				case 'info_lock':
					res[property] = IdentitySet.fromJSON(json[property]);
					break;

				case 'rewind_ids':
					res[property] = json[property].slice();
					break;

				case 'reasoning':
				case 'reasoning_turn':
					res[property] = json[property].slice();
					break;

				default:
					res[property] = Utils.shallowCopy(json[property]);
					break;
			}
		}
		return res;
	}

	/**
	 * Creates a deep copy of the card.
	 */
	clone() {
		return this.shallowCopy();
	}

	shallowCopy() {
		const copy = new Card(this.suitIndex, this.rank, this.possible, this.inferred, this.order, this.drawn_index, this.clued, this.newly_clued, this.clues);

		for (const property of Object.getOwnPropertyNames(this))
			copy[property] = this[property];

		return copy;
	}

	get possibilities() {
		return this.inferred.length === 0 ? this.possible : this.inferred;
	}

	/** Returns whether the card has been "touched" (i.e. clued or finessed). */
	get touched() {
		return this.clued || this.finessed || this.known || this.called_to_play;
	}

	/** Returns whether the card has been "saved" (i.e. clued, finessed or chop moved). */
	get saved() {
		return this.clued || this.finessed || this.chop_moved || this.known || this.called_to_play;
	}

	/**
	 * Returns the identity of the card (if known/inferred).
	 * 
	 * If the 'symmetric' option is enabled, asymmetric information (i.e. seeing the card) is not used.
	 * 
	 * If the 'infer' option is enabled, the card's inferences are used to determine its identity (as a last option).
	 * @param {MatchOptions} options
	 */
	identity(options = {}) {
		if (this.possible.length === 1)
			return this.possible.array[0];

		if (this.suitIndex !== -1 && this.rank !== -1 && !options.symmetric)
			return new BasicCard(this.suitIndex, this.rank);

		if (options.infer) {
			if (this.info_lock?.length === 1)
				return this.info_lock.array[0];

			if (this.inferred.length === 1)
				return this.inferred.array[0];
		}
	}

	/**
	 * Checks if the card matches the provided identity.
	 * @param {Identity} identity
	 * @param {MatchOptions} options
	 */
	matches({ suitIndex, rank }, options = {}) {
		const id = this.identity(options);

		if (id === undefined)
			return options.assume ?? false;

		return id.suitIndex === suitIndex && id.rank === rank;
	}

	/**
	 * Returns whether the card is a duplicate of the provided card (same suitIndex and rank, different order).
	 * @param {ActualCard} card
	 * @param {MatchOptions} options
	 */
	duplicateOf(card, options = {}) {
		return this.matches(card, options) && this.order !== card.order;
	}

	/**
	 * Returns the note on the card.
	 */
	getNote() {
		let note;
		if (this.inferred.length === 0)
			note = '??';
		else if (this.inferred.length <= 6)
			note = this.inferred.map(logCard).join(',');
		else
			note = '...';

		if (this.finessed)
			note = `[f] [${note}]`;

		if (this.chop_moved)
			note = `[cm] [${note}]`;

		if (this.called_to_discard)
			note = 'dc';

		return note;
	}

	reset_inferences() {
		const { order, possible, old_inferred, info_lock } = this;

		return produce(this, (draft) => {
			draft.reset = true;
			draft.known = false;

			const broke_info_lock = info_lock !== undefined && info_lock.intersect(possible).length === 0;

			if (broke_info_lock) {
				logger.warn(`broke info lock on ${order}, no intersection between locked ${info_lock.map(logCard)} and possible ${possible.map(logCard)}`);
				draft.info_lock = undefined;
			}

			if (draft.finessed) {
				draft.finessed = false;
				draft.hidden = false;
				if (!broke_info_lock && info_lock) {
					draft.inferred = info_lock;
				}
				else if (draft.old_inferred !== undefined) {
					draft.inferred = old_inferred.intersect(possible);
				}
				else {
					logger.error(`no old inferred on card with order ${order}!`);
					draft.inferred = possible;
				}
			}
			else {
				draft.inferred = (!broke_info_lock && info_lock) || possible;
			}
		});
	}
}
