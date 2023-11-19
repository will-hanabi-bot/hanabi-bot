import { logCard } from '../tools/log.js';

/**
 * @typedef {{symmetric?: boolean, infer?: boolean, assume?: boolean}} MatchOptions
 * @typedef {import('../types.js').BaseClue} BaseClue
 * @typedef {import('../types.js').BasicCard} BasicCard
 * @typedef {import('../types.js').Clue} Clue
 */

export class ActualCard {
	order = -1;
	clued = false;
	newly_clued = false;

	clues = /** @type {BaseClue[]} */ ([]);			// List of clues that have touched this card
	drawn_index = -1;

	/**
	 * @param {number} [suitIndex]	The index of the card's suit
	 * @param {number} [rank]		The rank of the card
	 */
	constructor(suitIndex, rank) {
		this.suitIndex = suitIndex;
		this.rank = rank;
	}
}

/**
 * Class for a single card (i.e. a suitIndex and rank). Other attributes are optional.
 */
export class Card extends ActualCard {
	order = -1;			// The ordinal number of the card

	possible = /** @type {Card[]} */ ([]);						// All possibilities of the card (from positive/negative information)
	inferred = /** @type {Card[]} */ ([]);						// All inferences of the card (from conventions)
	old_inferred = /** @type {Card[] | undefined} */ (undefined);		// Only used when undoing a finesse

	// Boolean flags about the state of the card
	focused = false;
	finessed = false;
	chop_moved = false;
	reset = false;			// Whether the card has previously lost all inferences
	chop_when_first_clued = false;
	superposition = false;	// Whether the card is currently in a superposition
	hidden = false;
	called_to_discard = false;

	drawn_index = -1;	// Action index of when the card was drawn
	finesse_index = -1;	// Action index of when the card was finessed
	reasoning = /** @type {number[]} */ ([]);		// The action indexes of when the card's possibilities/inferences were updated
	reasoning_turn = /** @type {number[]} */ ([]);	// The game turns of when the card's possibilities/inferences were updated
	rewinded = false;								// Whether the card has ever been rewinded

	/**
	 * @param {BasicCard & Partial<Card>} identity
	 */
	constructor({ suitIndex, rank , ...additions }) {
		super(suitIndex, rank);

		Object.assign(this, additions);
	}

	/**
	 * Creates a deep copy of the card.
	 */
	clone() {
		const new_card = new Card(this);

		for (const field of ['possible', 'inferred', 'clues', 'reasoning', 'reasoning_turn']) {
			new_card[field] = this[field].slice();
		}
		return new_card;
	}

	raw() {
		return Object.freeze({ suitIndex: this.suitIndex, rank: this.rank });
	}

	get possibilities() {
		return this.inferred.length === 0 ? this.possible : this.inferred;
	}

	/**
	 * Returns whether the card has been "saved" (i.e. clued, finessed or chop moved).
	 */
	get saved() {
		return this.clued || this.finessed || this.chop_moved;
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
		if (this.possible.length === 1) {
			return this.possible[0];
		}
		else if (!options.symmetric && this.suitIndex !== -1 && this.rank !== -1) {
			return this;
		}
		else if (options.infer && this.inferred.length === 1) {
			return this.inferred[0];
		}
		return;
	}

	/**
	 * Checks if the card matches the provided identity.
	 * @param {BasicCard} identity
	 * @param {MatchOptions} options
	 */
	matches({ suitIndex, rank }, options = {}) {
		const id = this.identity(options);

		if (id === undefined) {
			return options.assume ?? false;
		}

		return id.suitIndex === suitIndex && id.rank === rank;
	}

	/**
	 * Returns whether the card is a duplicate of the provided card (same suitIndex and rank, different order).
	 * @param {Card} card
	 * @param {MatchOptions} options
	 */
	duplicateOf(card, options = {}) {
		return this.matches(card, options) && this.order !== card.order;
	}

	/**
	 * Returns whether one of the card's inferences matches its actual suitIndex and rank.
	 * Returns true if the card has only 1 possibility or the card is unknown (i.e. in our hand). 
	 */
	matches_inferences() {
		return this.identity() === undefined || this.possible.length === 1 || this.inferred.some(c => c.matches(this));
	}

	/**
	 * Returns whether the card would be played on the stacks before the given identity.
	 * Always returns false if the two cards are of different suits.
	 * @param {BasicCard} identity
	 * @param {{ equal?: boolean }} options
	 */
	playedBefore({ suitIndex, rank }, options = {}) {
		return this.suitIndex === suitIndex && (options.equal ? (this.rank <= rank) : (this.rank < rank));
	}

	/**
	 * Sets the inferences/possibilities to the intersection of the existing field and the provided array of identities.
	 * @param {'possible' | 'inferred'} type
	 * @param {BasicCard[]} identities
	 */
	intersect(type, identities) {
		this[type] = this[type].filter(c1 => identities.some(c2 => c1.matches(c2)));
	}

	/**
	 * Sets the inferences/possibilities to the difference of the existing field and the provided array of identities.
	 * @param {'possible' | 'inferred'} type
	 * @param {BasicCard[]} identities
	 */
	subtract(type, identities) {
		this[type] = this[type].filter(c1 => !identities.some(c2 => c1.matches(c2)));
	}

	/**
	 * Sets the inferences/possibilities to the union of the existing field and the provided array of identities.
	 * @param {'possible' | 'inferred'} type
	 * @param {BasicCard[]} identities
	 */
	union(type, identities) {
		for (const card of identities) {
			if (!this[type].some(c => c.matches(card))) {
				this[type].push(Object.freeze(new Card({ suitIndex: card.suitIndex, rank: card.rank })));
			}
		}
	}

	/**
	 * Sets the inferences/possibilities to the provided array of identities.
	 * @param {'possible' | 'inferred'} type
	 * @param {BasicCard[]} identities
	 */
	assign(type, identities) {
		this[type] = identities.map(({ suitIndex, rank }) => Object.freeze(new Card({ suitIndex, rank })));
	}

	/**
	 * Returns the note on the card.
	 */
	getNote() {
		let note;
		if (this.inferred.length === 0) {
			note = '??';
		}
		else if (this.inferred.length <= 3) {
			note = this.inferred.map(c => logCard(c)).join(',');
		}
		else {
			note = '...';
		}

		if (this.finessed) {
			note = `[f] [${note}]`;
		}

		if (this.chop_moved) {
			note = `[cm] [${note}]`;
		}

		if (this.called_to_discard) {
			note = 'dc';
		}

		return note;
	}
}
