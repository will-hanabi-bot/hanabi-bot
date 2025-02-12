import { ActualCard, Card } from './basics/Card.js';
import { cardCount, find_possibilities } from './variants.js';
import { team_elimP } from './basics/helper.js';

import * as Utils from './tools/util.js';
import { produce } from './StateProxy.js';

/**
 * @typedef {import('./basics/Game.js').Game} Game
 * @typedef {import('./types.js').ClueAction} ClueAction
 * @typedef {import('./types.js').DiscardAction} DiscardAction
 * @typedef {import('./types.js').CardAction} DrawAction
 * @typedef {import('./types.js').PlayAction} PlayAction
 */

/**
 * @template {Game} T
 * @param {T} game
 * @param {ClueAction} action
 */
export function onClue(game, action) {
	const { common, state } = game;
	const { target, clue, list, giver } = action;
	const new_possible = find_possibilities(clue, state.variant);

	let newCommon = common;

	/** @param {import('./types.js').Writable<ActualCard>} card */
	const update_card = (card) => {
		if (!card.clued) {
			card.newly_clued = true;
			card.clued = true;
		}
		card.clues.push({...clue, giver, turn: state.turn_count });
	};

	const newState = produce(state, (draft) => {
		for (const order of list)
			update_card(draft.deck[order]);
	});

	for (const order of state.hands[target]) {
		const { possible, inferred } = common.thoughts[order];

		const operation = list.includes(order) ? 'intersect' : 'subtract';
		const new_inferred = inferred[operation](new_possible);

		newCommon = newCommon.withThoughts(order, (draft) => {
			if (list.includes(order)) {
				if (!common.thoughts[order].clued)
					draft.firstTouch = { giver, turn: state.turn_count };

				update_card(draft);
			}

			draft.possible = possible[operation](new_possible);
			draft.inferred = new_inferred;

			if (list.includes(order) && new_inferred.length < inferred.length)
				draft.reasoning_turn.push(state.turn_count);
		});
	}

	if (newState.endgameTurns !== -1)
		newState.endgameTurns--;

	newState.clue_tokens--;

	let newGame = game.shallowCopy();
	newGame.state = newState;
	newGame.common = newCommon.card_elim(state).refresh_links(state);
	newGame = team_elimP(newGame, false);
	return newGame;
}

/**
 * @template {Game} T
 * @param {T} game
 * @param {DiscardAction} action
 */
export function onDiscard(game, action) {
	const { common, state } = game;
	const { failed, order, playerIndex, rank, suitIndex } = action;
	const identity = { suitIndex, rank };

	let newGame = game.shallowCopy();

	const newState = produce(state, (draft) => {
		draft.hands[playerIndex].splice(state.hands[playerIndex].indexOf(order), 1);

		if (suitIndex !== -1 && rank !== -1) {
			draft.discard_stacks[suitIndex][rank - 1]++;
			draft.deck[order] = produce(state.deck[order], Utils.assignId({ suitIndex, rank }));

			// Discarded all copies of a card - the new max rank is (discarded rank - 1) if not already lower
			if (draft.discard_stacks[suitIndex][rank - 1] === cardCount(state.variant, { suitIndex, rank }))
				draft.max_ranks[suitIndex] = Math.min(state.max_ranks[suitIndex], rank - 1);
		}

		if (state.endgameTurns !== -1)
			draft.endgameTurns--;

		if (failed)
			draft.strikes++;
		else
			draft.clue_tokens = Math.min(state.clue_tokens + 1, 8);		// Bombs count as discards, but they don't give a clue token
	});

	if (suitIndex !== -1 && rank !== -1) {
		const { possible, inferred } = common.thoughts[order];
		const newCommon = common.withThoughts(order, (draft) => {
			draft.suitIndex = suitIndex;
			draft.rank = rank;
			draft.old_possible = possible;
			draft.old_inferred = inferred;
			draft.possible = possible.intersect(identity);
			draft.inferred = inferred.intersect(identity);
		});

		newGame.common = newCommon.card_elim(newState).refresh_links(newState);
	}

	newGame.state = newState;
	newGame = team_elimP(newGame, false);
	return newGame;
}

/**
 * @template {Game} T
 * @param {T} game
 * @param {DrawAction} action
 */
export function onDraw(game, action) {
	const { common, state } = game;
	const { order, playerIndex, suitIndex, rank } = action;

	const newState = produce(state, (draft) => {
		draft.hands[playerIndex].unshift(order);
		draft.deck[order] = Object.freeze(new ActualCard(suitIndex, rank, order, state.turn_count));

		draft.cardOrder = order;
		draft.cardsLeft--;

		if (draft.cardsLeft === 0)
			draft.endgameTurns = state.numPlayers;
	});

	const newPlayers = game.players.map((player, i) => produce(player, (draft) => {
		draft.thoughts[order] = Object.freeze(new Card(
			(i !== playerIndex || i === state.ourPlayerIndex) ? suitIndex : -1,
			(i !== playerIndex || i === state.ourPlayerIndex) ? rank : -1,
			player.all_possible,
			player.all_possible,
			order,
			state.turn_count));
	}).card_elim(newState).refresh_links(newState));

	const newCommon = produce(common, (draft) => {
		draft.thoughts[order] = Object.freeze(new Card(-1, -1, common.all_possible, common.all_possible, order, state.turn_count));
	}).card_elim(newState).refresh_links(newState);

	const newGame = game.shallowCopy();
	newGame.state = newState;
	newGame.players = newPlayers;
	newGame.common = newCommon;
	return newGame;
}

/**
 * @template {Game} T
 * @param {T} game
 * @param {PlayAction} action
 */
export function onPlay(game, action) {
	const { common, state } = game;
	const { order, playerIndex, rank, suitIndex } = action;
	const identity = { suitIndex, rank };

	let newGame = game.shallowCopy();

	const newState = produce(state, (draft) => {
		draft.hands[playerIndex].splice(state.hands[playerIndex].indexOf(order), 1);

		if (suitIndex !== undefined && rank !== undefined) {
			draft.play_stacks[suitIndex] = rank;
			draft.deck[order] = produce(state.deck[order], Utils.assignId({ suitIndex, rank }));
		}

		if (state.endgameTurns !== -1)
			draft.endgameTurns--;

		// Get a clue token back for playing a 5
		if (rank === 5 && state.clue_tokens < 8)
			draft.clue_tokens++;
	});

	if (suitIndex !== undefined && rank !== undefined) {
		const { possible, inferred } = common.thoughts[order];

		const newCommon = common.withThoughts(order, (draft) => {
			draft.suitIndex = suitIndex;
			draft.rank = rank;
			draft.old_possible = possible;
			draft.old_inferred = inferred;
			draft.possible = possible.intersect(identity);
			draft.inferred = inferred.intersect(identity);
		});

		newGame.common = newCommon.card_elim(newState).refresh_links(newState);
	}

	newGame.state = newState;
	newGame = team_elimP(newGame, false);
	return newGame;
}

/**
 * Temporary hack to keep mutable state.
 * @param {Game} game
 * @param {Game} newGame
 */
export function mutate(game, newGame) {
	// Temporary hack to keep mutable state
	Object.assign(game.state, newGame.state);
	Object.assign(game.common, newGame.common);
	for (let i = 0; i < game.state.numPlayers; i++)
		Object.assign(game.players[i], newGame.players[i]);
}
