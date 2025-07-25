import { unknownIdentities } from './hanabi-util.js';
import { IdentitySet } from './IdentitySet.js';
import { Card, CARD_STATUS } from './Card.js';
import * as Utils from '../tools/util.js';
import * as Elim from './player-elim.js';

import logger from '../tools/logger.js';
import { logCard, logConnection } from '../tools/log.js';
import { produce } from '../StateProxy.js';

/**
 * @typedef {import('./State.js').State} State
 * @typedef {import('./Card.js').BasicCard} BasicCard
 * @typedef {import('../types.js').Identity} Identity
 * @typedef {import('../types.js').Link} Link
 * @typedef {import('../types.js').WaitingConnection} WaitingConnection
 * @typedef {import('../StateProxy.js').Patch} Patch
 */

export class Player {
	card_elim = Elim.card_elim;
	refresh_links = Elim.refresh_links;
	find_links = Elim.find_links;
	good_touch_elim = Elim.good_touch_elim;
	restore_elim = Elim.restore_elim;

	/** @type {number[]} */
	hypo_stacks;

	/** @type {{ orders: number[], prereqs: Identity[], connected: number}[]} */
	play_links;

	/** @type {Set<number>} */
	hypo_plays;

	/** @type {Map<number, Patch[]>} */
	patches = new Map();

	/** @type {Map<string, number[]>} */
	elims = new Map();

	/**
	 * @param {number} playerIndex
	 * @param {IdentitySet} all_possible
	 * @param {IdentitySet} all_inferred
	 * @param {number[]} hypo_stacks
	 * @param {Set<number>} [hypo_plays]
	 * @param {number[][]} [hypo_map]
	 * @param {Card[]} [thoughts]
	 * @param {Link[]} [links]
	 * @param {{ orders: number[], prereqs: Identity[], connected: number}[]} [play_links]
	 * @param {Set<number>} [unknown_plays]
	 * @param {WaitingConnection[]} [waiting_connections]
	 * @param {Map<string, number[]>} [elims]
	 * @param {Map<number, Patch[]>} patches
	 */
	constructor(playerIndex, all_possible, all_inferred, hypo_stacks, hypo_plays = new Set(), hypo_map = [], thoughts = [], links = [], play_links = [], unknown_plays = new Set(), waiting_connections = [], elims = new Map(), patches = new Map()) {
		this.playerIndex = playerIndex;

		this.thoughts = thoughts;
		this.links = links;
		this.play_links = play_links;

		this.hypo_stacks = hypo_stacks;
		this.hypo_plays = hypo_plays;
		this.hypo_map = hypo_map;
		this.all_possible = all_possible;
		this.all_inferred = all_inferred;

		/**
		 * The orders of playable cards whose identities are not known, according to each player. Used for identifying TCCMs.
		 */
		this.unknown_plays = unknown_plays;

		this.waiting_connections = waiting_connections;
		this.elims = elims;
		this.patches = patches;
	}

	/** @param {Player} json */
	static fromJSON(json) {
		return new Player(json.playerIndex,
			IdentitySet.fromJSON(json.all_possible),
			IdentitySet.fromJSON(json.all_inferred),
			json.hypo_stacks.slice(),
			new Set(json.hypo_plays),
			Utils.objClone(json.hypo_map),
			json.thoughts.map(Card.fromJSON),
			json.links.map(Utils.objClone),
			json.play_links.map(Utils.objClone),
			new Set(json.unknown_plays),
			Utils.objClone(json.waiting_connections),
			new Map(json.elims),
			new Map(json.patches));
	}

	/** @returns {this} */
	clone() {
		return new /** @type {any} */ (this.constructor)(this.playerIndex,
			this.all_possible,
			this.all_inferred,
			this.hypo_stacks.slice(),
			new Set(this.hypo_plays),
			this.hypo_map.map(stack => stack.slice()),
			this.thoughts.slice(),
			this.links.map(link => Utils.objClone(link)),
			this.play_links.map(link => Utils.objClone(link)),
			new Set(this.unknown_plays),
			Utils.objClone(this.waiting_connections),
			new Map(this.elims),
			new Map(this.patches));
	}

	/** @returns {this} */
	shallowCopy() {
		return new /** @type {any} */ (this.constructor)(this.playerIndex,
			this.all_possible,
			this.all_inferred,
			this.hypo_stacks,
			this.hypo_plays,
			this.hypo_map,
			this.thoughts,
			this.links,
			this.play_links,
			this.unknown_plays,
			this.waiting_connections,
			this.elims,
			this.patches);
	}

	/**
	 * @param {number} order
	 * @param {(draft: import('../types.js').Writable<Card>) => void} func
	 * @param {boolean} [listenPatches]
	 */
	updateThoughts(order, func, listenPatches = this.playerIndex === -1) {
		this.thoughts = this.thoughts.with(order, produce(this.thoughts[order], func, listenPatches ? (patches) => {
			if (patches.length > 0)
				this.patches.set(order, (this.patches.get(order) ?? []).concat(patches));
		} : undefined));
	}

	/**
	 * @param {number} order
	 * @param {(draft: import('../types.js').Writable<Card>) => void} func
	 * @param {boolean} [listenPatches]
	 * @returns {typeof this}
	 */
	withThoughts(order, func, listenPatches = this.playerIndex === -1) {
		const copy = this.shallowCopy();
		copy.patches = new Map(this.patches);
		copy.thoughts = copy.thoughts.with(order, produce(this.thoughts[order], func, (patches) => {
			if (listenPatches && patches.length > 0)
				copy.patches.set(order, (this.patches.get(order) ?? []).concat(patches));
		}));
		return copy;
	}

	/**
	 * Returns a copy of the player with the orders chop moved.
	 * @param {number[]} orders
	 */
	simulateCM(orders) {
		const copy = this.shallowCopy();
		copy.thoughts = copy.thoughts.slice();

		for (const order of orders) {
			copy.thoughts[order] = produce(this.thoughts[order], (draft) => {
				draft.updateStatus(CARD_STATUS.CM);
			});
		}
		return copy;
	}

	/**
	 * Finds the order referred to by the given order.
	 * @param {'left' | 'right'} direction
	 * @param {number[]} hand
	 * @param {number} order
	 */
	refer(direction, hand, order) {
		const offset = direction === 'right' ? 1 : -1;
		const index = hand.indexOf(order);

		let target_index = (index + offset + hand.length) % hand.length;

		while (this.thoughts[hand[target_index]].touched && !this.thoughts[hand[target_index]].newly_clued)
			target_index = (target_index + offset + hand.length) % hand.length;

		return hand[target_index];
	}


	/**
	 * Returns whether they think the given player is locked (i.e. every card is clued, chop moved, or finessed AND not loaded).
	 * @param {State} state
	 * @param {number} playerIndex
	 * @param {boolean} [symmetric]
	 */
	thinksLocked(state, playerIndex, symmetric = false) {
		/** @param {number} order */
		const in_wc = (order) => this.waiting_connections.some(wc =>
			wc.target === playerIndex &&
			wc.connections.some((conn, i) => i >= wc.conn_index && conn.order === order && conn.identities.some(id => !state.isPlayable(id))));

		return state.hands[playerIndex].every(o => this.thoughts[o].saved || (symmetric && in_wc(o))) && !this.thinksLoaded(state, playerIndex);
	}

	/**
	 * Returns whether they they think the given player is loaded (i.e. has a known playable or trash).
	 * @param {State} state
	 * @param {number} playerIndex
	 * @param {{assume?: boolean, symmetric?: boolean}} options
	 */
	thinksLoaded(state, playerIndex, options = {}) {
		return this.thinksPlayables(state, playerIndex, options).length > 0 || this.thinksTrash(state, playerIndex).length > 0;
	}

	/**
	 * Returns playables in the given player's hand, according to this player.
	 * @param {State} state
	 * @param {number} playerIndex
	 * @param {{assume?: boolean, symmetric?: boolean}} options
	 */
	thinksPlayables(state, playerIndex, options = {}) {
		const linked_orders = this.linkedOrders(state);

		// TODO: Revisit if the card identity being known is relevant?
		// (e.g. if I later discover that I did not have a playable when I thought I did)
		return state.hands[playerIndex].filter(o => {
			const card = this.thoughts[o];
			if (card.trash && !card.possible.every(p => !state.isBasicTrash(p)))
				return false;

			const unsafe_linked = linked_orders.has(o) &&
				(state.strikes === 2 ||
					state.endgameTurns !== -1 ||
					card.possible.some(p => state.play_stacks[p.suitIndex] + 1 < p.rank && p.rank <= state.max_ranks[p.suitIndex]) ||
					Array.from(linked_orders).some(o2 => this.thoughts[o].focused && o2 !== o));

			if (unsafe_linked)
				return false;

			const known_playable = () =>
				card.possible.every(p => state.isBasicTrash(p) || state.isPlayable(p)) && card.possible.some(p => state.isPlayable(p));

			const conflicting_conn = () => {
				/** @type {WaitingConnection[]} */
				const dependents = [];

				for (const wc of this.waiting_connections) {
					// Ignore symmetric connections when looking at our own playables, since no one else will consider them
					if (playerIndex === state.ourPlayerIndex && wc.symmetric)
						continue;

					// Unplayable target of possible waiting connection
					if (wc.focus === o && !state.isPlayable(wc.inference) && card.possible.has(wc.inference)) {
						logger.debug(`order ${o} has conflicting connection ${wc.connections.map(logConnection).join(' -> ')} (unplayable target)`);
						return true;
					}

					if (wc.connections.some((conn, ci) => ci >= wc.conn_index && conn.order === o))
						dependents.push(wc);
				}

				for (const wc of dependents) {
					const depending_conn = wc.connections.find((conn, ci) => ci >= wc.conn_index && conn.order === o);
					const unplayable_ids = depending_conn.identities.filter(i => !state.isPlayable(i) && card.possible.has(i));
					if (unplayable_ids.length > 0) {
						logger.debug(`order ${o} has conflicting connection ${wc.connections.map(logConnection).join(' -> ')} with unplayable ids ${unplayable_ids.map(logCard)})`);
						return true;
					}
				}

				// Every connection using this card has another connection with the same focus that doesn't use it
				const replaceable = dependents.map(wc =>
					this.waiting_connections.find(wc2 => wc !== wc2 && wc2.focus === wc.focus && wc2.connections.every(conn2 => conn2.order !== o)));

				if (replaceable.length > 0 && replaceable.every(r => r !== undefined))
					logger.debug(`order ${o} has connections replaceable with ${replaceable.map(wc => wc.connections.map(logConnection).join(' -> '))}`);

				return replaceable.length > 0 && replaceable.every(r => r !== undefined);
			};

			return card.possibilities.every(p => (card.status === CARD_STATUS.CM ? state.isBasicTrash(p) : false) || state.isPlayable(p)) &&	// cm cards can ignore trash ids
				card.possibilities.some(p => state.isPlayable(p)) &&	// Exclude empty case
				((options.assume ?? true) || known_playable() || ((!card.uncertain || playerIndex === state.ourPlayerIndex) && !conflicting_conn())) &&
				(options.symmetric || state.hasConsistentInferences(card));
		});
	}

	/**
	 * Finds trash in the given hand, according to this player.
	 * @param {State} state
	 * @param {number} playerIndex
	 */
	thinksTrash(state, playerIndex) {
		/** @type {(identity: Identity, order: number) => boolean} */
		const visible_elsewhere = (identity, order) =>
			state.hands.flat().some(o => {
				const card = this.thoughts[o];

				return card.matches(identity, { infer: true }) &&
					state.deck[o].matches(identity, { assume: true }) &&
					(state.deck[o].clued || (card.blind_playing && !card.uncertain)) &&
					o !== order &&
					!this.links.some(link => link.orders.includes(order));
			});

		return state.hands[playerIndex].filter(o => {
			if (this.thoughts[o].trash)
				return true;

			const poss = this.thoughts[o].uncertain ? this.thoughts[o].possible : this.thoughts[o].possibilities;

			// Every possibility is trash or duplicated somewhere
			const trash = poss.every(p => state.isBasicTrash(p) || visible_elsewhere(p, o));

			if (trash)
				logger.debug(`order ${o} is trash, poss ${poss.map(logCard).join()}, ${poss.map(p => state.isBasicTrash(p) + '|' + visible_elsewhere(p, o)).join()}`);

			return trash;
		});
	}

	/**
	 * Finds the best discard in a locked hand. Breaks ties using the leftmost card.
	 * @param {State} state
	 * @param {number[]} hand
	 */
	lockedDiscard(state, hand) {
		// If any card's crit% is 0
		const crit_percents = hand.map(o => {
			const poss = this.thoughts[o].possibilities;
			const percent = poss.filter(p => state.isCritical(p)).length / poss.length;

			return { order: o, percent };
		}).sort((a, b) => a.percent - b.percent);

		const least_crits = crit_percents.filter(({ percent }) => percent === crit_percents[0].percent);

		/**
		 * @param {{suitIndex: number, rank: number}} possibility
		 * @param {boolean} all_crit
		 */
		const distance = ({ suitIndex, rank }, all_crit) => {
			const crit_distance = (all_crit ? rank * 5 : 0) + rank - this.hypo_stacks[suitIndex];
			return crit_distance < 0 ? 5 : crit_distance;
		};

		const { order: furthest_order } = Utils.maxOn(least_crits, ({ order }) =>
			this.thoughts[order].possibilities.reduce((sum, p) => sum += distance(p, crit_percents[0].percent === 1), 0));

		return furthest_order;
	}

	/**
	 * Finds the best play in a locked hand. Breaks ties using the leftmost card.
	 * @param {State} state
	 * @param {number[]} hand
	 */
	anxietyPlay(state, hand) {
		return hand.map((o, i) => {
			const poss = this.thoughts[o].possibilities;
			const percent = poss.filter(p => state.isPlayable(p)).length / poss.length;

			return { order: o, percent, index: i };
		}).sort((a, b) => {
			const diff = b.percent - a.percent;
			return diff !== 0 ? diff : a.index - b.index;
		})[0].order;
	}

	/**
	 * Returns the orders of cards of which this player is unsure about their identities (i.e. at least one is bad touched).
	 * @param {State} state
	 */
	linkedOrders(state) {
		const unknownLinks = this.links.filter(({ orders, identities }) =>
			orders.length > identities.reduce((sum, identity) => sum += unknownIdentities(state, this, identity), 0));

		return new Set(unknownLinks.flatMap(link => link.orders));
	}

	get hypo_score() {
		return this.hypo_stacks.reduce((sum, stack) => sum + stack) + this.unknown_plays.size;
	}

	/** @param {number} order */
	dependentConnections(order) {
		return this.waiting_connections.filter(wc => wc.connections.some((conn, index) => index >= wc.conn_index && conn.order === order));
	}

	/**
	 * @template {Player} T
	 * @this {T}
	 * @param {State} state
	 * @param {Set<number>} [ignoreOrders]
	 * @returns {T}
	 * Computes the hypo stacks and unknown plays.
	 */
	update_hypo_stacks(state, ignoreOrders) {
		// Reset hypo stacks to play stacks
		const hypo_stacks = state.play_stacks.slice();
		const unknown_plays = new Set();
		const already_played = new Set();

		/** @type {number[][]} */
		const card_map = Array.from({ length: state.variant.suits.length, }, _ => []);

		let found_new_playable = true;
		let good_touch_elim = new IdentitySet(state.variant.suits.length, 0);

		const linked_orders = this.linkedOrders(state);

		/**
		 * Checks if all possibilities have been either eliminated by good touch or are playable (but not all eliminated).
		 * @param {BasicCard[]} poss
		 */
		const delayed_playable = (poss) => {
			const remaining_poss = poss.filter(c => !good_touch_elim.has(c));
			return remaining_poss.length > 0 && remaining_poss.every(c => hypo_stacks[c.suitIndex] + 1 === c.rank);
		};

		const duplicated_plays = /** @type {Map<string, number[]>} */(new Map());

		// Attempt to play all playable cards
		while (found_new_playable) {
			found_new_playable = false;

			for (let i = 0; i < state.numPlayers; i++) {
				for (const order of state.hands[i]) {
					if (ignoreOrders?.has(order))
						continue;

					const card = this.thoughts[order];

					if (!card.saved || good_touch_elim.has(card) || linked_orders.has(order) || unknown_plays.has(order) || already_played.has(order))
						continue;

					const fake_wcs = this.waiting_connections.filter(wc =>
						wc.focus === order && !state.deck[wc.focus].matches(wc.inference, { assume: true }));

					// Ignore all waiting connections that will be proven wrong
					const playable = state.hasConsistentInferences(card) &&
						(delayed_playable(card.possible.array) ||
							delayed_playable(card.inferred.subtract(fake_wcs.flatMap(wc => wc.inference)).array) ||
							(card.blind_playing && delayed_playable([card])) ||
							this.play_links.some(pl => pl.connected === order && pl.orders.every(o => unknown_plays.has(o))));

					if (!playable)
						continue;

					const id = card.identity({ infer: true, symmetric: this.playerIndex === i });
					const actual_id = state.deck[order].identity();

					// Do not allow false updating of hypo stacks
					if (this.playerIndex === -1 && (
						(id && state.deck.filter(c => c?.matches(id) && c.order !== order).length === state.cardCount(id)) ||
						(actual_id && !card.inferred.has(actual_id))		// None of the inferences match
					))
						continue;

					if (this.playerIndex === -1 && actual_id) {
						const existing = Array.from(unknown_plays).find(o => state.deck[o].matches(actual_id));

						// An unknown play matches this identity, try swapping it out later
						if (existing !== undefined) {
							const hash = logCard(actual_id);
							duplicated_plays.set(hash, (duplicated_plays.get(hash) ?? [existing]).concat(order));
							continue;
						}
					}

					if (id === undefined) {
						// Playable, but the player doesn't know what card it is
						unknown_plays.add(order);
						already_played.add(order);
						found_new_playable = true;

						const fulfilled_links = this.links.filter(link =>
							link.promised && link.orders.includes(order) && link.orders.every(o => unknown_plays.has(o)));

						// All cards in a promised link will be played
						for (const link of fulfilled_links) {
							const id2 = link.identities[0];

							if (id2.rank !== hypo_stacks[id2.suitIndex] + 1) {
								logger.warn(`tried to add ${logCard(id2)} onto hypo stacks, but they were at ${hypo_stacks[id2.suitIndex]}??`);
							}
							else {
								hypo_stacks[id2.suitIndex] = id2.rank;
								good_touch_elim = good_touch_elim.union(id2);
							}
						}
						continue;
					}

					const { suitIndex, rank } = id;

					if (rank !== hypo_stacks[suitIndex] + 1) {
						// e.g. a duplicated 1 before any 1s have played will have all bad possibilities eliminated by good touch
						logger.warn(`tried to add new playable card ${logCard(id)} ${order}, hypo stacks at ${hypo_stacks[suitIndex]}`);
						continue;
					}

					hypo_stacks[suitIndex] = rank;
					good_touch_elim = good_touch_elim.union(id);
					found_new_playable = true;
					already_played.add(order);
					card_map[suitIndex][rank] = order;
				}
			}
		}

		let bestPlayer = produce(this, (draft) => {
			draft.hypo_stacks = hypo_stacks;
			draft.unknown_plays = unknown_plays;
			draft.hypo_plays = already_played;
			draft.hypo_map = card_map;
		});

		if (ignoreOrders === undefined) {
			// TODO: This doesn't quite get all possible arrangements of possible dupes; it should be some permutation of ignores between ids
			// Hopefully it's good enough.
			for (const orders of duplicated_plays.values()) {
				const ignore = new Set().add(orders[0]);

				for (let i = 0; i < orders.length; i++) {
					ignore.add(orders[i]);
					const newPlayer = this.update_hypo_stacks(state, ignore);

					if (newPlayer.hypo_score > bestPlayer.hypo_score)
						bestPlayer = newPlayer;
				}
			}
		}

		return bestPlayer;
	}

	/**
	 * Reverts the hypo stacks of the given suitIndex to the given rank - 1, if it was originally above that.
	 * @param {Identity} identity
	 */
	undo_hypo_stacks({ suitIndex, rank }) {
		logger.info(`discarded useful card ${logCard({suitIndex, rank})}, setting hypo stack to ${rank - 1}`);

		return produce(this, (draft) => {
			draft.hypo_stacks[suitIndex] = Math.min(this.hypo_stacks[suitIndex], rank - 1);
		});
	}

}
