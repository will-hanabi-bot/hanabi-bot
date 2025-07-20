import { ACTION } from '../../constants.js';
import { ActualCard } from '../../basics/Card.js';
import { playersBetween } from '../h-group/hanabi-logic.js';
import { getTimeout, UnsolvedGame } from './endgame.js';
import * as Utils from '../../tools/util.js';

import { logCard } from '../../tools/log.js';

/**
 * @typedef {import('../../basics/Game.js').Game} Game
 * @typedef {import('../../basics/State.js').State} State
 * @typedef {import('../../types.js').Identity} Identity
 * @typedef {import('../../types.js').Clue} Clue
 * @typedef {import('../../types.js').Action} Action
 * @typedef {import('../../types.js').PerformAction} PerformAction
 * @typedef {Omit<PerformAction, 'tableID'> & {playerIndex: number}} ModPerformAction
 * @typedef {{ id: Identity, missing: number, all: boolean }[]} RemainingSet
 */

export const simpler_cache = new Map();

/**
 * @param {State} state
 */
function hash_state(state) {
	const { clue_tokens, endgameTurns } = state;
	const hands = state.hands.flatMap(hand => hand.map(o => logCard(state.deck[o]))).join();

	return `${state.deck.map(logCard)},${hands},${clue_tokens},${endgameTurns}`;
}

/**
 * @param {State} state
 * @param {number[]} hand
 */
function find_must_plays(state, hand) {
	const id_groups = Utils.groupBy(hand, o => logCard(state.deck[o]));

	const res = Object.values(id_groups).reduce((acc, group) => {
		const id = state.deck[group[0]];

		if (id.suitIndex === -1 || state.isBasicTrash(id))
			return acc;

		// All remaining copies of this identity are in the hand
		if (state.cardCount(id) - state.baseCount(id) === group.length)
			acc.push(id);

		return acc;
	}, /** @type {Identity[]} */([]));

	return res;
}

/**
 * @param {State} state
 * @param {number} playerTurn
 */
export function unwinnable_state(state, playerTurn) {
	if (state.ended || state.pace < 0) {
		// logger.info('ended?', state.ended, 'pace', state.pace);
		return true;
	}

	const void_players = Utils.range(0, state.numPlayers).filter(i =>
		state.hands[i].every(o => ((c = state.deck[o]) => c.identity() === undefined || state.isBasicTrash(c))()));

	if (void_players.length > state.pace) {
		// logger.info('void players', void_players, state.pace);
		return true;
	}

	const must_plays = state.hands.map(hand => find_must_plays(state, hand));
	const must_start_endgame = Utils.findIndices(must_plays, ids => ids.length > 1);

	if (state.endgameTurns !== -1) {
		const possible_players = Utils.range(0, state.endgameTurns).filter(i => !void_players.includes((playerTurn + i) % state.numPlayers));

		if (possible_players.length + state.score < state.maxScore) {
			// logger.info('possible players:', possible_players, 'score:', state.score, 'max:', state.maxScore);
			return true;
		}

		for (let i = 0; i < state.endgameTurns; i++) {
			const playerIndex = (playerTurn + i) % state.numPlayers;
			const must_play = must_plays[playerIndex];

			if (must_play.length > 1) {
				// logger.info(state.playerNames[playerIndex], 'must play', must_play.map(logCard).join(), 'but endgame started');
				return true;
			}
		}
	}

	if (state.cardsLeft === 1) {
		// At least 2 people need to play 2 cards
		if (must_start_endgame.length > 1) {
			// logger.info('unwinnable', must_start_endgame, 'need to start endgame', must_start_endgame.map(i => must_plays[i].map(logCard)));
			return true;
		}

		if (must_start_endgame.length === 1) {
			const target = must_start_endgame[0];

			if (playerTurn !== target && playersBetween(state.numPlayers, playerTurn, target).length > state.clue_tokens) {
				// logger.info('unwinnable', playerTurn, target, 'too far to start endgame');
				return false;
			}
		}
	}

	return false;
}

/**
 * @param {Game} game
 * @param {number} playerTurn
 */
export function trivially_winnable(game, playerTurn) {
	const { state } = game;

	if (state.score === state.maxScore)
		return { trivial: true, action: undefined };

	// Try having everyone play what they know
	if (state.endgameTurns !== -1 && state.maxScore - state.score <= state.endgameTurns) {
		const play_stacks = state.play_stacks.slice();

		/** @type {ModPerformAction} */
		let action = { type: ACTION.DISCARD, target: state.hands[playerTurn].at(-1), playerIndex: playerTurn };

		for (let i = 0; i < state.endgameTurns; i++) {
			const playerIndex = (playerTurn + i) % state.numPlayers;
			const playables = game.players[playerIndex].thinksPlayables(state, playerIndex);

			if (playables.length > 1)
				return { trivial: false };

			if (playables.length === 0)
				continue;

			const id = state.deck[playables[0]];
			if (play_stacks[id.suitIndex] + 1 !== id.rank)
				return { trivial: false };

			if (i === 0)
				action = { type: ACTION.PLAY, target: playables[0], playerIndex: playerTurn };

			play_stacks[id.suitIndex] = id.rank;
		}

		if (play_stacks.reduce((a, c) => a + c) === state.maxScore)
			return { trivial: true, action };
	}
	return { trivial: false };
}

/**
 * @param {State} state
 * @param {number} playerTurn
 */
function get_playables(state, playerTurn) {
	return state.hands[playerTurn].filter(o => state.isPlayable(state.deck[o])).sort((a, b) => {
		const card1 = state.deck[a].identity();
		const card2 = state.deck[b].identity();

		const connecting_other = (id) =>
			state.hands.some((hand, i) => i !== playerTurn && hand.some(o => state.deck[o].matches({ suitIndex: id.suitIndex, rank: id.rank + 1 })));

		const [conn1, conn2] = [card1, card2].map(connecting_other);
		if (conn1 && !conn2)
			return -1;

		if (conn2 && !conn1)
			return 1;

		const connecting_self = (id) =>
			state.hands[playerTurn].some(o => state.deck[o].matches({ suitIndex: id.suitIndex, rank: id.rank + 1 }));

		const [conn1_s, conn2_s] = [card1, card2].map(connecting_self);
		if (conn1_s && !conn2_s)
			return -1;

		if (conn2_s && !conn1_s)
			return 1;

		if (state.isCritical(card1) && state.isCritical(card2))
			return card1.rank < card2.rank ? -1 : 1;

		if (state.isCritical(card1) && !state.isCritical(card2))
			return -1;

		if (!state.isCritical(card1) && state.isCritical(card2))
			return 1;

		return card1.rank < card2.rank ? -1 : 1;
	});
}

/**
 * Returns whether the game is winnable if everyone can look at their own cards.
 * 
 * @param {State} state
 * @param {number} playerTurn
 * @param {RemainingSet} remaining_ids
 * @param {number} depth
 * @returns {boolean}
 */
export function winnable_simpler(state, playerTurn, remaining_ids, depth = 0) {
	if (state.score === state.maxScore) {
		// logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}won!!`);
		return true;
	}

	if (unwinnable_state(state, playerTurn)) {
		// logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}unwinnable state`);
		return false;
	}

	if (Date.now() > getTimeout())
		throw new UnsolvedGame('timed out');

	const hash = `${hash_state(state)},${playerTurn},${JSON.stringify(remaining_ids.filter(r => logCard(r.id) !== 'xx'))}`;

	const cached_result = simpler_cache.get(hash);
	if (cached_result !== undefined)
		return cached_result;

	/** @type {ModPerformAction[]} */
	const possible_actions = [];

	for (const order of get_playables(state, playerTurn))
		possible_actions.push({ type: ACTION.PLAY, target: order, playerIndex: playerTurn });

	if (state.clue_tokens > 0)
		possible_actions.push({ type: ACTION.RANK, target: -1, value: -1, playerIndex: playerTurn });

	const discardable = state.hands[playerTurn].find(o => ((c = state.deck[o]) => c.identity() === undefined || state.isBasicTrash(c))());

	if (state.pace >= 0 && discardable !== undefined)
		possible_actions.push({ type: ACTION.DISCARD, target: discardable, playerIndex: playerTurn });

	const winnable = possible_actions.some(action => winnable_if(state, playerTurn, action, remaining_ids, depth).winnable);
	simpler_cache.set(hash, winnable);

	return winnable;
}

/**
 * @param {RemainingSet} remaining
 * @param {Identity} id
 */
export function remove_remaining(remaining, id) {
	const index = remaining.findIndex(r => r.id.suitIndex === id.suitIndex && r.id.rank === id.rank);
	const { missing, all } = remaining[index];

	if (missing === 1)
		return remaining.toSpliced(index, 1);
	else
		return remaining.with(index, { id, missing: missing - 1, all });
}

/**
 * @param {State} state
 * @param {number} playerTurn
 * @param {ModPerformAction} action
 * @param {RemainingSet} remaining_ids
 * @param {number} [depth]
 */
export function winnable_if(state, playerTurn, action, remaining_ids, depth = 0) {
	if (action.type === ACTION.RANK || action.type === ACTION.COLOUR || state.cardsLeft === 0) {
		const newState = advance_state(state, action, undefined);
		// logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}checking if winnable after ${logObjectiveAction(state, action)} {`);
		const winnable = winnable_simpler(newState, state.nextPlayerIndex(playerTurn), remaining_ids, depth + 1);

		// logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}} ${winnable}`);
		return { winnable };
	}

	/** @type {Identity[]} */
	const winnable_draws = [];

	// logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}remaining ids ${JSON.stringify(remaining_ids.map(r => ({...r, id: logCard(r.id) })))}`);

	for (const { id } of remaining_ids) {
		const draw = Object.freeze(new ActualCard(id.suitIndex, id.rank, state.cardOrder + 1, state.turn_count));
		const newState = advance_state(state, action, draw);
		const new_remaining = remove_remaining(remaining_ids, id);

		// logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}checking if winnable after ${logObjectiveAction(state, action)} drawing ${logCard(id)} {`);
		const winnable = winnable_simpler(newState, state.nextPlayerIndex(playerTurn), new_remaining, depth + 1);

		if (winnable)
			winnable_draws.push(id);

		// logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}} ${winnable}`);
	}

	return { winnable: winnable_draws.length > 0, winnable_draws };
}

/**
 * @param {State} state
 * @param {ModPerformAction} action
 * @param {ActualCard} draw
 */
function advance_state(state, action, draw) {
	const new_state = state.shallowCopy();
	new_state.hands = state.hands.slice();
	new_state.turn_count++;

	/**
	 * @param {number} playerIndex
	 * @param {number} order
	 */
	const remove_and_draw_new = (playerIndex, order) => {
		const newCardOrder = state.cardOrder + 1;
		const index = state.hands[playerIndex].indexOf(order);
		new_state.hands[playerIndex] = new_state.hands[playerIndex].toSpliced(index, 1);

		if (state.endgameTurns === -1) {
			new_state.hands[playerIndex] = new_state.hands[playerIndex].toSpliced(0, 0, newCardOrder);

			new_state.cardOrder++;
			new_state.cardsLeft--;

			if (new_state.cardsLeft === 0)
				new_state.endgameTurns = state.numPlayers;
		}
		else {
			new_state.endgameTurns--;
		}

		if (state.deck[newCardOrder] === undefined) {
			new_state.deck = new_state.deck.slice();
			new_state.deck[newCardOrder] = draw ?? Object.freeze(new ActualCard(-1, -1, newCardOrder, state.turn_count));
		}
	};

	/** @param {Identity} identity */
	const update_discards = ({ suitIndex, rank }) => {
		const { discard_stacks } = state;
		const new_discard_stack = discard_stacks[suitIndex].with(rank - 1, discard_stacks[suitIndex][rank - 1] + 1);
		new_state.discard_stacks = discard_stacks.with(suitIndex, new_discard_stack);
	};

	switch (action.type) {
		case ACTION.PLAY: {
			const { playerIndex, target } = action;
			const identity = state.deck[target].identity();

			if (identity !== undefined) {
				const { suitIndex, rank } = identity;
				if (state.isPlayable(identity)) {
					new_state.play_stacks = state.play_stacks.with(suitIndex, rank);

					if (rank === 5)
						new_state.clue_tokens = Math.min(state.clue_tokens + 1, 8);
				}
				else {
					update_discards(identity);
					new_state.strikes++;
				}
			}
			else {
				new_state.strikes++;
			}

			remove_and_draw_new(playerIndex, target);
			break;
		}
		case ACTION.DISCARD: {
			const { playerIndex, target } = action;
			const identity = state.deck[target].identity();

			if (identity !== undefined)
				update_discards(identity);

			new_state.clue_tokens = Math.min(state.clue_tokens + 1, 8);
			remove_and_draw_new(playerIndex, target);
			break;
		}
		case ACTION.COLOUR:
		case ACTION.RANK:
			new_state.clue_tokens--;
			new_state.endgameTurns = state.endgameTurns === -1 ? -1 : (state.endgameTurns - 1);
			break;
	}

	return new_state;
}
