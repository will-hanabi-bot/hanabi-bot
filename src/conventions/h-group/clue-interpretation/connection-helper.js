import { CLUE } from '../../../constants.js';
import { BasicCard, CARD_STATUS } from '../../../basics/Card.js';
import { IdentitySet } from '../../../basics/IdentitySet.js';
import { IllegalInterpretation, find_own_finesses } from './own-finesses.js';

import logger from '../../../tools/logger.js';
import { logCard, logConnection, logConnections } from '../../../tools/log.js';
import { isTrash } from '../../../basics/hanabi-util.js';
import { LEVEL } from '../h-constants.js';
import { variantRegexes } from '../../../variants.js';
import { colour_save, rank_save } from './focus-possible.js';

/**
 * @typedef {import('../../h-group.js').default} Game
 * @typedef {import('../../../basics/State.js').State} State
 * @typedef {import('../../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../h-player.js').HGroup_Player} Player
 * @typedef {import('../../../basics/Action.ts').ClueAction} ClueAction
 * @typedef {import('../../../types.js').Connection} Connection
 * @typedef {import('../../../types.js').Identity} Identity
 * @typedef {import('../../../types.js').FocusPossibility} FocusPossibility
 * @typedef {import('../../../types.js').SymFocusPossibility} SymFocusPossibility
 * @typedef {import('../../../types.js').WaitingConnection} WaitingConnection
 * @typedef {import('../../../types.js').FocusResult} FocusResult
 */

/**
 * Determines whether the receiver can infer the exact identity of the focused card.
 * @param {{ connections: Connection[]}[]} all_connections
 */
export function inference_known(all_connections) {
	if (all_connections.length > 1)
		return false;

	const { connections } = all_connections[0];
	return connections.length === 0 || connections.every(conn => conn.type === 'known' || (conn.type === 'playable' && conn.linked.length === 1));
}

/**
 * Returns the inferred rank of the card given a set of connections on a particular suit.
 * @param {State} state
 * @param {number} suitIndex
 * @param {Connection[]} connections
 */
export function inference_rank(state, suitIndex, connections) {
	return state.play_stacks[suitIndex] + 1 + connections.filter(conn => !conn.hidden || conn.bluff).length;
}

/**
 * Returns whether playing an identity would be a valid bluff.
 * @param {Game} game
 * @param {ClueAction} action
 * @param {Identity} blind
 * @param {Identity} truth
 * @param {number} reacting
 * @param {number[]} connected
 * @param {boolean} symmetric
 */
export function valid_bluff(game, action, blind, truth, reacting, connected, symmetric = false) {
	const { state } = game;
	const nextCard = { suitIndex: blind.suitIndex, rank: blind.rank + 1 };
	const { giver, target, clue } = action;

	return game.level >= LEVEL.BLUFFS &&
		state.nextPlayerIndex(giver) === reacting &&					// must be bluff seat
		connected.length === 1 &&											// must not be delayed
		(symmetric || (clue.type === CLUE.RANK && clue.value !== nextCard.rank) ||
			blind.rank === state.base_ids.maxStackRank ||
			!game.common.thoughts[connected[0]].possible.has(nextCard)) &&	// must disconnect
		!(clue.type === CLUE.COLOUR && reacting === target) &&				// must not be self-colour bluff
		!state.hands[reacting].some(o => {								// must not be confused with an existing finesse (or possibly-layered gd)
			const card = game.players[reacting].thoughts[o];
			return (card.blind_playing || (card.status === CARD_STATUS.GD && card.maybe_layered)) && card.possible.has(truth);
		});
}

/**
 * Returns whether the given identity is a valid target for an intermediate bluff.
 * @param {Game} game
 * @param {ClueAction} action
 * @param {Identity} identity
 * @param {number} focus
 */
export function is_intermediate_bluff_target(game, action, identity, focus) {
	const { state } = game;
	const { clue } = action;
	return game.level >= LEVEL.INTERMEDIATE_BLUFFS && identity.rank === 3 ||
		// Critical non-unique cards can be used as a bluff target by color:
		(clue.type === CLUE.COLOUR && identity.rank == 4 && game.common.thoughts[focus].newly_clued && state.isCritical(identity));
}

/**
 * Returns possible bluffed card identities for a given clue.
 * @param {Game} game
 * @param {ClueAction} action
 * @param {BasicCard[]} possible
 * @param {number} order
 * @param {number} reacting
 */
export function get_bluffable_ids(game, action, possible, order, reacting) {
	const { state } = game;
	return possible.filter(id => state.isPlayable(id))
		.filter(id => valid_bluff(game, action, id, {suitIndex: id.suitIndex, rank: state.play_stacks[id.suitIndex] + 1}, reacting, [order], true));
}

/**
 * Generates symmetric connections from a list of symmetric focus possibilities.
 * @param {State} state
 * @param {SymFocusPossibility[]} sym_possibilities
 * @param {FocusPossibility[]} existing_connections
 * @param {number} focus
 * @param {number} giver
 * @param {number} target
 * @returns {WaitingConnection[]}
 */
export function generate_symmetric_connections(state, sym_possibilities, existing_connections, focus, giver, target) {
	const symmetric_connections = [];

	for (const sym of sym_possibilities) {
		const { connections, suitIndex, rank } = sym;

		// No connections required
		if (connections.length === 0)
			continue;

		// Matches an inference we have
		if (existing_connections.some((conn) => conn.suitIndex === suitIndex && conn.rank === rank))
			continue;

		symmetric_connections.push({
			connections,
			conn_index: 0,
			focus,
			inference: { suitIndex, rank },
			giver,
			target,
			action_index: state.turn_count,
			turn: state.turn_count,
			symmetric: true
		});
	}

	return symmetric_connections;
}

/**
 * Returns all focus possibilities that the receiver could interpret from the clue.
 * @param {Game} game
 * @param {ClueAction} action
 * @param {FocusResult} focusResult
 * @param {FocusPossibility[]} inf_possibilities
 * @param {number[]} selfRanks 		The ranks needed to play by the target (as a self-finesse).
 * @param {number} ownBlindPlays 	The number of blind plays we need to make in the actual connection.
 * @param {boolean} loaded
 * @returns {SymFocusPossibility[]}
 */
export function find_symmetric_connections(game, action, focusResult, inf_possibilities, selfRanks, ownBlindPlays, loaded) {
	const { common, state } = game;

	const { clue, giver, target } = action;
	const { focus, chop } = focusResult;
	const focused_card = common.thoughts[focus];

	/** @type {SymFocusPossibility[][]} */
	const [self_connections, non_self_connections] = inf_possibilities.reduce((acc, fp) => {
		const [self, non_self] = acc;
		const dest = (fp.connections.find(conn => conn.type !== 'known' && conn.type !== 'playable')?.reacting === target) ? self: non_self;
		const { suitIndex, rank, connections } = fp;

		dest.push({ suitIndex, rank, connections, fake: false });
		return acc;
	}, [[], []]);

	/** @type {(conns: Connection[], playerIndex: number) => number} */
	const blind_plays = (conns, playerIndex) => conns.filter(conn => conn.type === 'finesse' && conn.reacting === playerIndex).length;

	for (const id of focused_card.inferred) {
		// Receiver won't consider trash possibilities or ones that are subsumed by real possibilities
		if (isTrash(state, common, id, focus, { infer: true }) || inf_possibilities.some(fp => fp.suitIndex === id.suitIndex && fp.rank >= id.rank))
			continue;

		// Pink promise
		if (clue.type === CLUE.RANK && state.includesVariant(variantRegexes.pinkish) && id.rank !== clue.value)
			continue;

		const visible_dupe = state.hands.some((hand, i) => {
			const useCommon = i === giver || i === target;

			return hand.some(o => {
				const card = (useCommon ? common : game.players[target]).thoughts[o];
				return card.matches(id, { infer: useCommon }) && o !== focus && card.touched;
			});
		});

		if (visible_dupe)
			continue;

		if (chop && (clue.type === CLUE.COLOUR ? colour_save(game, id, action, focus, loaded) : rank_save(game, id, action, focus, loaded))) {
			non_self_connections.push({ ...id.raw(), connections: [], fake: false });
			continue;
		}

		const looksDirect = focused_card.identity({ symmetric: true }) === undefined && (		// Focus must be unknown AND
			inf_possibilities.some(fp => !fp.illegal && game.players[target].thoughts[focus].possible.has(fp) &&	// looks like a possibility
				fp.connections.every(conn => conn.type === 'known' || (conn.type === 'playable' && conn.reacting !== state.ourPlayerIndex))));

		logger.off();

		try {
			const connections = find_own_finesses(game, action, focus, id, looksDirect, target, selfRanks);
			// Fake connection - we need to blind play too many times
			const fake = blind_plays(connections, state.ourPlayerIndex) > ownBlindPlays;

			if (connections.find(conn => conn.type !== 'known' && conn.type !== 'playable')?.reacting === target)
				self_connections.push({ ...id.raw(), connections, fake });
			else
				non_self_connections.push({ ...id.raw(), connections, fake });
		}
		catch (error) {
			if (error instanceof IllegalInterpretation) {
				// Will probably never be seen
				logger.warn(error.message);
			}
			else {
				throw error;
			}
		}
		logger.on();
	}

	// If there is at least one non-fake connection that doesn't start with self, the receiver won't try to start with self.
	const possible_connections = non_self_connections.filter(fp => !fp.fake).length === 0 ? self_connections : non_self_connections;

	// Filter out focus possibilities that are strictly more complicated (i.e. connections match up until some point, but has more self-components after)
	const simplest_connections = occams_razor(game, possible_connections, target, focus);
	const sym_conn = simplest_connections.map(conn => logConnections(conn.connections, { suitIndex: conn.suitIndex, rank: conn.rank }));

	logger.info('symmetric connections', sym_conn);
	return simplest_connections;
}

/**
 * Applies the given connections on the given suit to the state (e.g. writing finesses).
 * 
 * Impure! (modifies common and game.finesses_while_finessed)
 * @param {Game} game
 * @param {Omit<FocusPossibility, 'interp'>[]} simplest_poss
 * @param {Omit<FocusPossibility, 'interp'>[]} all_poss
 * @param {ClueAction} action
 * @param {ActualCard} focused_card
 */
export function assign_all_connections(game, simplest_poss, all_poss, action, focused_card) {
	const { common, state, me } = game;
	const { giver, clue, target } = action;
	const focus = focused_card.order;

	// Find the cards used as a 'playable' in every bluff connection. If any bluff connection exists that doesn't use it, no notes should be written.
	const bluff_fps = simplest_poss.filter(fp => fp.connections[0]?.bluff);
	const bluff_playables = bluff_fps.map(fp => fp.connections.filter(conn => conn.type === 'playable').flatMap(conn => conn.order));
	const must_bluff_playables = bluff_playables[0]?.filter(o => bluff_playables.every(os => os.includes(o))) ?? [];

	for (const { connections, suitIndex, rank, save } of simplest_poss) {
		const inference = { suitIndex, rank };
		const matches = focused_card.matches(inference, { assume: true }) && game.players[target].thoughts[focus].possible.has(inference);

		// Don't assign save connections or known false connections
		if (save || !matches)
			continue;

		const hypo_stacks = common.hypo_stacks.slice();

		for (const conn of connections) {
			const { type, reacting, bluff, possibly_bluff, hidden, order, linked, identities, certain } = conn;

			if (type === 'playable' && connections[0].bluff && !must_bluff_playables.includes(order))
				continue;

			logger.info('assigning connection', logConnection(conn));

			const playable_identities = hypo_stacks
				.map((stack_rank, index) => {
					const contained_i = common.hypo_map[index]?.findIndex(o => o === order) ?? -1;
					return { suitIndex: index, rank: contained_i === -1 ? stack_rank + 1 : contained_i };
				})
				.filter(id => id.rank <= state.max_ranks[id.suitIndex] && !isTrash(state, common, id, order, { infer: true }));

			const currently_playable_identities = state.play_stacks
				.map((stack_rank, index) =>({ suitIndex: index, rank: stack_rank + 1 }))
				.filter(id => id.rank <= state.max_ranks[id.suitIndex]);

			const is_unknown_playable = type === 'playable' && linked.length > 1 && focused_card.matches(inference, { assume: true });

			const card = common.thoughts[order];
			let new_inferred = card.inferred;

			if (bluff || hidden) {
				new_inferred = new_inferred.intersect(playable_identities);

				if (bluff)
					new_inferred = new_inferred.intersect(currently_playable_identities);
			}
			else {
				// There are multiple possible connections on this card
				if (card.superposition)
					new_inferred = new_inferred.union(identities);
				else if (card.uncertain)
					new_inferred = new_inferred.union(card.finesse_ids.intersect(identities));

				if (!is_unknown_playable && !card.superposition && !card.uncertain)
					new_inferred = IdentitySet.create(state.variant.suits.length, identities);
			}

			common.updateThoughts(order, (draft) => {
				// Save the old inferences in case the connection doesn't exist (e.g. not finesse)
				draft.old_inferred ??= common.thoughts[order].inferred;

				if (type === 'finesse') {
					draft.updateStatus(possibly_bluff ? (reacting === state.ourPlayerIndex ? CARD_STATUS.F_MAYBE_BLUFF : CARD_STATUS.MAYBE_BLUFFED) :
						bluff ? CARD_STATUS.BLUFFED :
						CARD_STATUS.FINESSED);

					draft.firstTouch = { giver, turn: state.turn_count };
					draft.finesse_index = state.turn_count;
					draft.hidden = hidden;
					draft.certain_finessed ||= certain;
				}

				if (connections.some(conn => conn.type === 'finesse'))
					draft.finesse_index = draft.finesse_index === -1 ? state.turn_count : draft.finesse_index;

				draft.inferred = new_inferred;
				if (!bluff && !hidden)
					draft.superposition = true;

				const uncertain = (() => {
					if (card.uncertain || giver === state.ourPlayerIndex || card.rewinded || certain)
						return false;

					if (reacting === state.ourPlayerIndex) {
						// We are uncertain if the card isn't known and there's some other card in our hand that allows for a swap
						return type !== 'known' && identities.some(i => state.ourHand.some(o => o !== order && me.thoughts[o].possible.has(i))) &&
							// The card also needs to be playable in some other suit
							card.possible.some(i => i.suitIndex !== identities[0].suitIndex && i.rank <= common.hypo_stacks[i.suitIndex] + 1);
					}

					// We are uncertain if the connection is a finesse that could be ambiguous
					const uncertain_conn = (type === 'finesse' && all_poss.length > 1) ||
						(type === 'prompt' && me.thoughts[focus].possible.some(p => p.suitIndex !== identities[0].suitIndex));

					return uncertain_conn && !((identities.every(i => state.isCritical(i)) && focused_card.matches(inference)) ||
						// Colour finesses are guaranteed if the focus cannot be a finessed identity
						(clue.type === CLUE.COLOUR && identities.every(i => !me.thoughts[focused_card.order].possible.has(i))));
				})();

				if (uncertain) {
					logger.info('writing uncertain', order, identities.map(logCard), new_inferred.map(logCard));
					const self_playable_identities = state.ourHand.reduce((stacks, order) => {
						const card = common.thoughts[order];
						const id = card.identity({ infer: true });

						if (id !== undefined && card.blind_playing && stacks[id.suitIndex] + 1 === id.rank)
							stacks[id.suitIndex]++;

						return stacks;
					}, state.play_stacks.slice()).map((stack_rank, index) =>({ suitIndex: index, rank: stack_rank + 1 }))
						.filter(id => id.rank <= state.max_ranks[id.suitIndex]);

					draft.finesse_ids = state.base_ids.union(bluff ? currently_playable_identities : self_playable_identities);
					draft.uncertain = true;
				}

				// Updating notes not on our turn
				// There might be multiple possible inferences on the same card from a self component
				// TODO: Examine why this originally had self only?
				if (draft.old_inferred.length > draft.inferred.length && draft.reasoning_turn.at(-1) !== state.turn_count)
					draft.reasoning_turn.push(state.turn_count);
			});

			if (type === 'finesse' && state.hands[giver].some(o => common.thoughts[o].blind_playing))
				game.finesses_while_finessed[giver].push(state.deck[order]);

			if (bluff || hidden) {
				// Temporarily force update hypo stacks so that layered finesses are written properly (?)
				if (state.deck[order].identity() !== undefined) {
					const { suitIndex, rank } = state.deck[order].identity();
					if (hypo_stacks[suitIndex] + 1 !== rank)
						logger.warn('trying to connect', logCard(state.deck[order]), 'but hypo stacks at', hypo_stacks[suitIndex]);

					hypo_stacks[suitIndex] = rank;
				}
			}
			else if (is_unknown_playable) {
				const existing_link_index = common.links.find(link => {
					const { promised } = link;
					const { suitIndex, rank } = link.identities[0];

					return promised &&
						identities[0].suitIndex === suitIndex && identities[0].rank === rank &&
						link.orders.length === linked.length &&
						link.orders.every(o => linked.includes(o));
				});

				if (existing_link_index === undefined) {
					logger.info('adding promised link with identities', identities.map(logCard), 'and orders', linked);
					common.links.push({ promised: true, identities, orders: linked, target: focused_card.order });
				}
			}
		}
	}
}

/**
 * @param {Pick<FocusPossibility, 'connections'>} focus_possibility
 * @param {number} playerIndex
 */
export function connection_score(focus_possibility, playerIndex) {
	const { connections } = focus_possibility;

	const asymmetric_penalty = connections.filter(conn => conn.asymmetric).length * 10;
	const first_unknown = connections.findIndex(conn => conn.type !== 'known' && conn.type !== 'playable');

	// Starts on someone else
	if (connections[first_unknown]?.reacting !== playerIndex)
		return asymmetric_penalty;

	let blind_plays = 0, prompts = 0;
	const first_self = connections.findIndex(conn => conn.type !== 'known' && conn.type !== 'playable' && conn.reacting === playerIndex);

	for (let i = first_self; i < connections.length; i++) {
		const conn = connections[i];

		if (conn.type === 'finesse')
			blind_plays++;

		if (conn.type === 'prompt')
			prompts++;
	}

	return asymmetric_penalty + blind_plays + 0.1*prompts;
}

/**
 * @template {Pick<FocusPossibility, 'suitIndex'| 'rank' | 'connections'>} T
 * @param {Player} me
 * @param {T} fp1
 * @param {T} fp2
 * @param {number} playerIndex
 */
export function isSimpler(me, fp1, fp2, playerIndex) {
	const { connections: conns1 } = fp1;
	const { connections: conns2 } = fp2;

	// Requires asymmetric info
	const [asym1, asym2] = [conns1, conns2].map(conns => conns.filter(conn => conn.asymmetric).length);
	if (asym1 !== asym2)
		return asym1 - asym2;

	/** @param {Connection[]} conns */
	const first_unknown = (conns) => conns.findIndex(conn => conn.type !== 'known' && conn.type !== 'playable');
	const [fconns1, fconns2] = [conns1, conns2].map(conns => {
		const index = first_unknown(conns);
		return index === -1 ? [] : conns.slice(first_unknown(conns));
	});

	// First unknown connection is on self
	const [self1, self2] = [fconns1, fconns2].map(conns => conns[0]?.reacting === playerIndex);

	if (self1 !== self2)
		return self1 ? 1 : -1;

	// Both have first unknown connection on someone other than self
	if (!self1)
		return 0;

	// Both have first unknown connection on self

	const [truth1, truth2] = [fconns1, fconns2].map(conns => conns.every(conn => me.thoughts[conn.order].rewinded || !conn.bluff));

	if (truth1 !== truth2)
		return truth1 ? -1 : 1;

	const [finesses1, finesses2] = [fconns1, fconns2].map(conns => conns.filter(conn => conn.reacting === playerIndex && conn.type === 'finesse').length);

	if (finesses1 !== finesses2)
		return finesses1 - finesses2;

	const [prompts1, prompts2] = [fconns1, fconns2].map(conns => conns.filter(conn => conn.reacting === playerIndex && conn.type === 'prompt').length);

	return prompts1 - prompts2;
}

/**
 * @template {Pick<FocusPossibility, 'suitIndex'| 'rank' | 'connections'>} T
 * @param {Game} game
 * @param {T[]} focus_possibilities
 * @param {number} playerIndex
 * @param {number} focused_order
 */
export function occams_razor(game, focus_possibilities, playerIndex, focused_order) {
	const sorted = focus_possibilities.toSorted((a, b) => isSimpler(game.me, a, b, playerIndex));

	logger.debug('occams razor', focus_possibilities.map(fp => logConnections(fp.connections, fp)), sorted.map(fp => logConnections(fp.connections, fp)));

	const i = sorted.findIndex(fp => game.players[playerIndex].thoughts[focused_order].possible.has(fp));

	if (i === -1)
		return sorted;

	const simplest = sorted.filter((_, j) => j <= i || isSimpler(game.me, sorted[i], sorted[j], playerIndex) === 0);

	return simplest;
}
