import { cardCount } from '../variants.js';
import { IdentitySet } from './IdentitySet.js';
import * as Utils from '../tools/util.js';

import logger from '../tools/logger.js';
import { logCard } from '../tools/log.js';
import { produce } from '../StateProxy.js';

/**
 * @typedef {import('./Card.js').Card} Card
 * @typedef {import('./Card.js').ActualCard} ActualCard
 * @typedef {import('./Player.js').Player} Player
 * @typedef {import('./State.js').State} State
 * @typedef {import('../types.js').Identity} Identity
 * @typedef {import('../types.js').Link} Link
 */

/**
 * Eliminates card identities using only possible information.
 * @this {Player}
 * @param {State} state
 * @returns {typeof this}
 */
export function card_elim(state) {
	const certain_map = /** @type {Map<string, { order: number, unknown_to: number[] }[]>} */ (new Map());
	let uncertain_ids = state.base_ids;
	let uncertain_map = /** @type {Map<number, IdentitySet>} */ (new Map());

	/** @type {Map<number, Card>} */
	const newThoughts = new Map();

	/** @type {(order: number) => Card} */
	const getThoughts = (order) => newThoughts.get(order) ?? this.thoughts[order];

	/** @type {(order: number, producer: (draft: Card) => void) => void} */
	const updateThoughts = (order, producer) => {
		const target = newThoughts.get(order) ?? this.thoughts[order].shallowCopy();
		producer(target);
		newThoughts.set(order, target);
	};

	/** @type {Map<string, { order: number, playerIndex: number}[]>} */
	const idMap = new Map();

	/** @type {{ order: number, playerIndex: number }[]} */
	const candidates = [];

	let all_identities = state.base_ids;
	for (const order of state.hands.flat()) {
		all_identities = all_identities.union(this.thoughts[order].possible);

		if (all_identities.length === state.all_ids.length)
			break;
	}

	for (let playerIndex = 0; playerIndex < state.numPlayers; playerIndex++) {
		for (const order of state.hands[playerIndex]) {
			const card = this.thoughts[order];
			const id = card.identity({ symmetric: this.playerIndex === -1 });
			const unknown_to = card.identity({ symmetric: true }) === undefined ? [playerIndex] : [];

			if (id !== undefined)
				Utils.mapInsertArr(certain_map, logCard(id), { order, unknown_to });

			if (card.possible.length > 1)
				candidates.push({ order, playerIndex });

			for (const p of card.possible)
				Utils.mapInsertArr(idMap, logCard(p), { order, playerIndex });
		}
	}

	let eliminated = state.base_ids;

	/**
	 * The "typical" empathy operation. If there are enough known instances of an identity, it is removed from every card (including future cards).
	 * Returns true if at least one card was modified.
	 * @param {Identity[]} identities
	 */
	const basic_elim = (identities) => {
		let changed = false;
		const recursive_ids = [];

		for (const id of identities) {
			const id_hash = logCard(id);

			const known_count = state.baseCount(id) + (certain_map.get(id_hash)?.length ?? 0) + (uncertain_ids.has(id) ? 1 : 0);
			const total_count = cardCount(state.variant, id);

			if (known_count !== total_count)
				continue;

			eliminated = eliminated.union(id);

			const remainingCandidates = idMap.get(id_hash).filter(({ order, playerIndex }) => {
				const { possible, inferred, reset } = getThoughts(order);

				const no_elim = !possible.has(id) ||
					certain_map.get(id_hash)?.some(c => c.order === order || c.unknown_to.includes(playerIndex)) ||
					uncertain_map.get(order)?.has(id);

				if (no_elim)
					return true;

				changed = true;

				updateThoughts(order, (draft) => {
					draft.possible = possible.subtract(id);
					draft.inferred = inferred.subtract(id);
				});

				const updated_card = getThoughts(order);

				if (updated_card.inferred.length === 0 && !reset) {
					newThoughts.set(order, updated_card.reset_inferences());
				}
				// Card can be further eliminated
				else if (updated_card.possible.length === 1) {
					const recursive_id = updated_card.identity();

					Utils.mapInsertArr(certain_map, logCard(recursive_id), { order, unknown_to: [] });
					recursive_ids.push(recursive_id);
					candidates.splice(candidates.findIndex(c => c.order === order), 1);
				}
				return false;
			});
			idMap.set(id_hash, remainingCandidates);
		}

		if (recursive_ids.length > 0)
			changed ||= basic_elim(recursive_ids);

		return changed;
	};

	/**
	 * The "sudoku" empathy operation, involving 2 parts.
	 * Symmetric info - if Alice has [r5,g5] and Bob has [r5,g5], then everyone knows how r5 and g5 are distributed.
	 * Naked pairs - If Alice has 3 cards with [r4,g5], then everyone knows that both r4 and g5 cannot be elsewhere (will be eliminated in basic_elim).
	 * Returns true if at least one card was modified.
	 */
	const cross_elim = () => {
		uncertain_ids = state.base_ids;
		uncertain_map = new Map();

		const cross_elim_candidates = candidates.filter(({ order }) => {
			const card = getThoughts(order);
			return card.possible.some(p => !state.isBasicTrash(p)) && (card.possible.length < 5 || card.clued);
		});

		if (cross_elim_candidates.length <= 1)
			return;

		/** @param {IdentitySet} identities */
		const total_multiplicity = (identities) => identities.reduce((acc, id) => acc += cardCount(state.variant, id) - state.baseCount(id), 0);

		/**
		 * @param {{ order: number, playerIndex: number }[]} entries
		 * @param {IdentitySet} identities
		 */
		const perform_elim = (entries, identities) => {
			let changed = false;

			// There are N cards for N identities - everyone knows they are holding what they cannot see
			const groups = Utils.groupBy(entries, ({ order }) => JSON.stringify(state.deck[order].identity()));

			for (const [id_hash, group] of Object.entries(groups)) {
				if (id_hash === 'undefined')
					continue;

				/** @type {Identity} */
				const id = JSON.parse(id_hash);

				if (group.length < total_multiplicity(state.base_ids.union(id)))
					continue;

				for (const { order } of entries) {
					// Players can't elim if one of their cards is part of it
					if (group.some(e => e.order === order) || !getThoughts(order).possible.has(id))
						continue;

					const { possible, inferred } = getThoughts(order);
					updateThoughts(order, (draft) => {
						draft.possible = possible.subtract(id);
						draft.inferred = inferred.intersect(possible);
					});
					changed = true;
				}
			}

			if (!changed) {
				for (const { order } of entries)
					uncertain_map.set(order, state.base_ids.union(identities));

				uncertain_ids = uncertain_ids.union(identities);
			}

			changed ||= basic_elim(identities.array);
			return changed;
		};

		const gen_gray_code = function* () {
			let i = 2;
			while (true) {
				yield 0; yield 1; yield 0; yield i;
				i++;
			}
		};

		let changed = false;

		do {
			/** @type {Map<string, number>} */
			const crossIDMap = new Map();
			const contained = Array.from({ length: cross_elim_candidates.length }, _ => false);
			let groupSize = 0, multiplicity = 0;
			const gray_code = gen_gray_code();

			let nextFlip = /** @type {number} */ (gray_code.next().value);
			changed = false;

			while (nextFlip < cross_elim_candidates.length) {
				const { order } = cross_elim_candidates[nextFlip];
				const adding = !contained[nextFlip];

				for (const p of getThoughts(order).possible) {
					const hash = logCard(p);
					const newVal = (crossIDMap.get(hash) ?? 0) + (adding ? 1 : -1);
					crossIDMap.set(hash, newVal);

					if (adding && newVal === 1)
						multiplicity += cardCount(state.variant, p) - state.baseCount(p);

					if (!adding && newVal === 0)
						multiplicity -= cardCount(state.variant, p) - state.baseCount(p);
				}

				groupSize = groupSize + (adding ? 1 : -1);
				contained[nextFlip] = !contained[nextFlip];

				if (groupSize > 1 && multiplicity === groupSize) {
					const subset = cross_elim_candidates.filter((_, i) => contained[i]);
					const acc_ids = subset.reduce((a, { order }) => a.union(getThoughts(order).possible), state.base_ids);

					changed = perform_elim(subset, acc_ids);
					if (changed)
						break;
				}
				nextFlip = /** @type {number} */ (gray_code.next().value);
			}
		} while (changed);
	};

	basic_elim(all_identities.array);
	cross_elim();

	const { all_possible, all_inferred } = this;
	const newAP = all_possible.subtract(eliminated);
	const newAI = all_inferred.subtract(eliminated);

	const newPlayer = produce(this, (draft) => {
		// Remove all eliminated ids from the list of future possibilities
		draft.all_possible = newAP;
		draft.all_inferred = newAI;

		for (const [order, newCard] of newThoughts.entries())
			draft.thoughts[order] = newCard;
	});
	return newPlayer;
}

/**
 * Eliminates card identities based on Good Touch Principle.
 * Returns the orders of the cards that lost all inferences (were reset).
 * @template {Player} T
 * @this {T}
 * @param {State} state
 * @param {boolean} only_self 	Whether to only use cards in own hand for elim (e.g. in 2-player games, where GTP is less strong.)
 * @returns {T}
 */
export function good_touch_elim(state, only_self = false) {
	const match_map = /** @type {Map<string, Set<number>>} */ (new Map());
	const hard_match_map = /** @type {Map<string, Set<number>>} */ (new Map());
	const cross_map = /** @type {Map<number, Set<number>>} */ (new Map());

	let newPlayer = this;

	/** @type {(order: number, playerIndex: number) => void} */
	const addToMaps = (order, playerIndex) => {
		const card = newPlayer.thoughts[order];
		const id = card.identity({ infer: true, symmetric: this.playerIndex === -1 || this.playerIndex === playerIndex });

		if (!card.touched || card.uncertain || card.possibly_finessed)
			return;

		if (id === undefined) {
			if (card.inferred.length < 5 && this.playerIndex === -1) {
				const cross_set = cross_map.get(card.inferred.value) ?? new Set();
				cross_set.add(order);
				cross_map.set(card.inferred.value, cross_set);
			}
			return;
		}

		const id_hash = logCard(id);

		if (card.matches(id) || card.focused)
			hard_match_map.set(id_hash, (hard_match_map.get(id_hash) ?? new Set()).add(order));

		match_map.set(id_hash, (match_map.get(id_hash) ?? new Set()).add(order));

		const matches = match_map.get(id_hash);
		const hard_matches = hard_match_map.get(id_hash);

		if (matches && hard_matches && (state.baseCount(id) + matches.size > cardCount(state.variant, id))) {
			const visibles = Array.from(matches).concat(Array.from(hard_matches)).filter(o => state.deck[o].matches(id));

			if (visibles.length > 0) {
				for (const v of visibles) {
					const holder = state.hands.findIndex(hand => hand.includes(v));

					// This player can see the identity, so their card must be trash - the player with the identity can see the trash
					for (const hard_match of hard_matches) {
						if (state.hands.findIndex(hand => hand.includes(hard_match)) !== holder)
							hard_matches.delete(hard_match);
					}
				}
				hard_match_map.delete(id_hash);
				return;
			}
		}
	};

	/** @type {{ order: number, playerIndex: number, cm: boolean }[]} */
	const elim_candidates = [];

	for (let i = 0; i < state.numPlayers; i++) {
		if (only_self && i !== this.playerIndex)
			continue;

		for (const order of state.hands[i]) {
			addToMaps(order, i);

			if (newPlayer.thoughts[order].trash)
				continue;

			const card = newPlayer.thoughts[order];

			if (card.inferred.length > 0 && card.possible.some(inf => !state.isBasicTrash(inf)) && !card.certain_finessed) {
				// Touched cards always elim
				if (card.touched)
					elim_candidates.push({ order, playerIndex: i, cm: false });

				// Chop moved cards can asymmetric/visible elim
				else if (card.chop_moved)
					elim_candidates.push({ order, playerIndex: i, cm: this.playerIndex === -1 });
			}
		}
	}

	let identities = state.base_ids;
	for (const order of state.hands.flat())
		identities = identities.union(this.thoughts[order].inferred);

	const trash_ids = identities.filter(i => state.isBasicTrash(i));

	newPlayer = produce(newPlayer, (draft) => {
		// Remove all trash identities
		for (const { order, cm } of elim_candidates) {
			const new_inferred = newPlayer.thoughts[order].inferred.subtract(trash_ids);
			draft.thoughts[order].inferred = new_inferred;

			if (!cm && new_inferred.length === 0 && !newPlayer.thoughts[order].reset)
				draft.thoughts[order] = newPlayer.thoughts[order].reset_inferences();
		}
	});

	identities = identities.subtract(trash_ids);

	const basic_elim = () => {
		let changed = false;
		const curr_identities = identities.array;
		let new_identities = identities;

		for (let i = 0; i < curr_identities.length; i++) {
			const identity = curr_identities[i];
			const id_hash = logCard(identity);
			const soft_matches = match_map.get(id_hash);

			if (soft_matches === undefined)
				continue;

			const hard_matches = hard_match_map.get(logCard(identity));
			const matches = hard_matches ?? soft_matches ?? new Set();
			const matches_arr = Array.from(matches);

			const bad_elim = matches_arr.length > 0 && matches_arr.every(order =>
				(state.deck[order].identity() !== undefined && !state.deck[order].matches(identity)) ||		// Card is visible and doesn't match
				(state.baseCount(identity) + state.hands.flat().filter(o => state.deck[o].matches(identity) && o !== order).length === cardCount(state.variant, identity)));	// Card cannot match

			if (bad_elim)
				continue;

			for (const { order, playerIndex, cm } of elim_candidates) {
				const old_card = newPlayer.thoughts[order];

				if (matches.has(order) || old_card.inferred.length === 0 || !old_card.inferred.has(identity))
					continue;

				const visible_elim = state.hands.some(hand => hand.some(o => matches.has(o) && state.deck[o].matches(identity, { assume: true }))) &&
					state.baseCount(identity) + matches.size >= cardCount(state.variant, identity);

				const { firstTouch } = old_card ?? {};

				// Check if every match was from the clue giver (or vice versa)
				const asymmetric_gt = !state.isCritical(identity) && !(cm && visible_elim) && matches.size > 0 &&
					(matches_arr.every(o => {
						const { giver, turn } = newPlayer.thoughts[o].firstTouch ?? {};
						return giver === playerIndex && turn > (firstTouch?.turn ?? 0);
					}) ||
					(firstTouch !== undefined && matches_arr.every(o =>
						state.hands[firstTouch.giver].includes(o) &&
						newPlayer.thoughts[o].possibilities.length > 1
					)));

				if (asymmetric_gt)
					continue;

				const self_elim = this.playerIndex !== -1 && matches_arr.length > 0 && matches_arr.every(o =>
					state.hands[playerIndex].includes(o) && newPlayer.thoughts[o].identity({ infer: true, symmetric: true }) !== identity);
				if (self_elim)
					continue;

				// TODO: Temporary stop-gap so that Bob still plays into it. Bob should actually clue instead.
				if (old_card.finessed && [0, 1].some(i => old_card.finesse_index === state.turn_count - i)) {
					logger.warn(`tried to gt eliminate ${id_hash} from recently finessed card (player ${this.playerIndex}, order ${order})!`);
					newPlayer = produce(newPlayer, (draft) => { draft.thoughts[order].certain_finessed = true; });
					elim_candidates.splice(elim_candidates.findIndex(c => c.order === order), 1);
					continue;
				}

				// Check if can't visible elim on cm card (not visible, or same hand)
				if (cm && !visible_elim)
					continue;

				const { inferred, reset } = newPlayer.thoughts[order];
				const new_inferred = inferred.subtract(identity);

				newPlayer = produce(newPlayer, (draft) => { draft.thoughts[order].inferred = new_inferred; });

				new_identities = new_identities.subtract(identity);
				changed = true;

				const newElims = new Map(newPlayer.elims);
				newElims.set(id_hash, (newElims.get(id_hash) ?? []).concat(order));
				newPlayer.elims = newElims;

				if (!cm) {
					if (new_inferred.length === 0 && !reset)
						newPlayer.thoughts = newPlayer.thoughts.with(order, newPlayer.thoughts[order].reset_inferences());

					// Newly eliminated
					else if (new_inferred.length === 1 && old_card.inferred.length > 1 && !state.isBasicTrash(new_inferred.array[0]))
						curr_identities.push(new_inferred.array[0]);

				}
			}
		}

		for (const { order, playerIndex } of elim_candidates)
			addToMaps(order, playerIndex);

		identities = new_identities;
		return changed;
	};

	const cross_elim = () => {
		let changed = false;
		for (const [idens, orders] of cross_map) {
			const identity_set = new IdentitySet(state.variant.suits.length, idens);

			// There aren't the correct number of cards sharing this set of identities
			if (orders.size !== identity_set.length)
				continue;

			const orders_arr = Array.from(orders);
			const holders = orders_arr.map(o => state.hands.findIndex(hand => hand.includes(o)));
			let change = false;

			for (let i = 0; i < orders.size; i++) {
				const card = newPlayer.thoughts[orders_arr[i]];
				const orig_clue = card.clues[0];

				for (let j = 0; j < orders.size; j++) {
					const other_card = state.deck[orders_arr[j]];
					const other_orig_clue = other_card.clues[0];

					// Check if every match was from the clue giver (or vice versa)
					const asymmetric_gt = !state.isCritical(other_card) &&
						((other_orig_clue?.giver === holders[i] && other_orig_clue.turn > (orig_clue?.turn ?? 0)) ||
							(orig_clue?.giver === holders[j] && newPlayer.thoughts[orders_arr[j]].possibilities.length > 1));

					if (asymmetric_gt)
						continue;

					// Globally, a player can subtract identities others have, knowing others can see the identities they have.
					if (i !== j && holders[i] !== holders[j] && card.inferred.has(other_card)) {
						const { inferred } = newPlayer.thoughts[orders_arr[i]];
						newPlayer = produce(newPlayer, (draft) => { draft.thoughts[orders_arr[i]].inferred = inferred.subtract(other_card); });
						change = true;
						changed = true;
					}
				}
			}

			if (change) {
				cross_map.delete(idens);

				for (const order of orders)
					addToMaps(order, state.hands.findIndex(hand => hand.includes(order)));
			}
		}
		return changed;
	};

	let basic_changed = basic_elim();
	let cross_changed = cross_elim();

	while (basic_changed || cross_changed) {
		basic_changed = basic_elim();

		if (basic_changed || cross_changed)
			cross_changed = cross_elim();
	}

	return newPlayer;
}

/**
 * Finds good touch (non-promised) links in the hand.
 * @template {Player} T
 * @this {T}
 * @param {State} state
 * @param {number[]} [hand]
 */
export function find_links(state, hand = state.hands[this.playerIndex]) {
	let newPlayer = this;

	if (this.playerIndex === -1 && hand === undefined) {
		for (const hand of state.hands)
			newPlayer = newPlayer.find_links(state, hand);

		return newPlayer;
	}

	const links = [];
	const linked_orders = new Set(this.links.flatMap(link => link.orders));

	for (const order of hand) {
		const card = this.thoughts[order];
		const identities = card.inferred;

		if (linked_orders.has(order) ||								// Already in a link
			card.identity() !== undefined ||						// We know what this card is
			identities.length === 0 ||								// Card has no inferences
			identities.length > 3 ||								// Card has too many inferences
			identities.every(inf => state.isBasicTrash(inf))) {		// Card is trash
			continue;
		}

		// Find all unknown cards with the same inferences
		const orders = hand.filter(o => card.identity() === undefined && identities.equals(this.thoughts[o].inferred));
		if (orders.length === 1)
			continue;

		const focused_orders = orders.filter(o => this.thoughts[o].focused);

		if (focused_orders.length === 1 && identities.length === 1) {
			logger.info('eliminating link with inferences', identities.map(logCard), 'from focus! final', focused_orders[0]);
			for (const order of orders) {
				const op = (order === focused_orders[0]) ? 'intersect' : 'subtract';
				newPlayer = produce(newPlayer, (draft) => { draft.thoughts[order].inferred = newPlayer.thoughts[order].inferred[op](identities.array[0]); });
			}
			continue;
		}

		// We have enough inferred cards to eliminate elsewhere
		// TODO: Sudoku elim from this
		if (orders.length >= identities.length) {
			logger.info('adding link', orders, 'inferences', identities.map(logCard), state.playerNames[this.playerIndex]);

			links.push({ orders, identities: identities.map(c => c.raw()), promised: false });
			for (const o of orders)
				linked_orders.add(o);
		}
	}

	return produce(newPlayer, (draft) => { draft.links = newPlayer.links.concat(links); });
}

/**
 * Refreshes the array of links based on new information (if any).
 * @template {Player} T
 * @this {T}
 * @param {State} state
 * @returns {T}
 */
export function refresh_links(state) {
	/** @type {Link[]} */
	const new_links = [];
	let newPlayer = this;

	for (const link of this.links) {
		const { orders, identities, promised, target } = link;

		if (promised) {
			if (identities.length > 1)
				throw new Error(`found promised link with orders ${orders} but multiple identities ${identities.map(logCard)}`);

			// At least one card matches, promise resolved
			if (orders.some(o => this.thoughts[o].identity()?.matches(identities[0])))
				continue;

			if (target !== undefined && !this.thoughts[target].possible.some(i => identities.some(j => i.suitIndex === j.suitIndex)))
				continue;

			// Reduce cards to ones that still have the identity as a possibility
			const viable_orders = orders.filter(o => this.thoughts[o].possible.has(identities[0]));

			if (viable_orders.length === 0) {
				logger.warn(`promised identity ${logCard(identities[0])} not found among cards ${orders}, rewind?`);
				continue;
			}

			if (viable_orders.length === 1) {
				newPlayer = produce(newPlayer, (draft) => { draft.thoughts[viable_orders[0]].inferred = newPlayer.thoughts[viable_orders[0]].inferred.intersect(identities[0]); });
				continue;
			}

			new_links.push({ ...link, orders: viable_orders });
			continue;
		}

		const revealed = orders.filter(o => {
			const card = newPlayer.thoughts[o];

			// The card is globally known or an identity is no longer possible
			return card.identity() || identities.some(id => !card.possible.has(id));
		});

		if (revealed.length > 0)
			continue;

		const focused_orders = orders.filter(o => newPlayer.thoughts[o].focused);

		if (focused_orders.length === 1 && identities.length === 1) {
			logger.info('eliminating link with inferences', identities.map(logCard), 'from focus! final', focused_orders[0]);
			for (const order of orders) {
				const op = (order === focused_orders[0]) ? 'intersect' : 'subtract';
				newPlayer = produce(newPlayer, (draft) => { draft.thoughts[order].inferred = newPlayer.thoughts[order].inferred[op](identities[0]); });
			}
			continue;
		}

		const lost_inference = identities.find(i => orders.some(o => !newPlayer.thoughts[o].inferred.has(i)));
		if (lost_inference !== undefined) {
			logger.info('linked orders', orders, 'lost inference', logCard(lost_inference));
			continue;
		}
		new_links.push(link);
	}

	return produce(newPlayer, (draft) => { draft.links = new_links; }).find_links(state);
}

/**
 * @template {Player} T
 * @this {T}
 * @param {Identity} identity
 */
export function restore_elim(identity) {
	const id = logCard(identity);
	const elims = this.elims.get(id)?.filter(order => (({ possible, info_lock } = this.thoughts[order]) =>
		// Only add the inference back if it's still a possibility
		possible.has(identity) && (info_lock === undefined || info_lock.has(identity))));

	let newPlayer = this;

	if (elims?.length > 0) {
		logger.warn(`adding back inference ${id} which was falsely eliminated from ${elims} in player ${this.playerIndex}'s view`);

		for (const order of elims) {
			if (newPlayer.thoughts[order].focused)
				continue;

			newPlayer = newPlayer.withThoughts(order, (draft) => { draft.inferred = newPlayer.thoughts[order].inferred.union(identity); });
		}
	}

	const newElims = new Map(newPlayer.elims);
	newElims.delete(id);

	return produce(newPlayer, (draft) => {
		draft.all_inferred = newPlayer.all_inferred.union(identity);
		draft.elims = newElims;
	});
}
