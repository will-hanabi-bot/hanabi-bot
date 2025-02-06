import { CLUE } from '../../constants.js';
import { IdentitySet } from '../../basics/IdentitySet.js';
import { team_elimP } from '../../basics/helper.js';
import * as Basics from '../../basics.js';

import logger from '../../tools/logger.js';
import { logCard } from '../../tools/log.js';

/**
 * @typedef {import('../playful-sieve.js').default} Game
 * @typedef {import('../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../types.js').PlayAction} PlayAction
 */

/**
 * Determines the unlocked card, given a play action and the unlocked and locked hands.
 * @param  {Game} game
 * @param  {PlayAction} action
 * @param  {number} unlocked_player
 * @param  {number} locked_player
 * @param  {number} locked_shifts
 * @returns {number | undefined} The unlocked card order, or undefined if the unlock is not guaranteed.
 */
export function unlock_promise(game, action, unlocked_player, locked_player, locked_shifts = 0) {
	const { common, state } = game;
	const { order, suitIndex, rank } = action;

	// Playing an unknown card doesn't unlock
	if (common.thoughts[order].identity({ infer: true }) === undefined) {
		logger.highlight('cyan', 'playing unknown card, not unlocking');
		return;
	}

	const playables = common.thinksPlayables(state, unlocked_player);

	// Sorted from oldest to newest
	const playables_sorted = playables.sort((a, b) => common.thoughts[a].reasoning_turn.at(-1) - common.thoughts[b].reasoning_turn.at(-1));

	// Playing oldest (or only) playable, not guaranteed unlock
	if (common.thinksTrash(state, unlocked_player).length + state.hands[unlocked_player].filter(o => common.thoughts[o].called_to_discard).length === 0 &&
		order === playables_sorted[0]
	) {
		logger.highlight('cyan', 'playing oldest/only safe playable, not unlocking');
		return;
	}

	const locked_hand = state.hands[locked_player];

	// Known connecting card
	const match = locked_hand.find(o => common.thoughts[o].matches({ suitIndex, rank: rank + 1 }, { infer: true }));
	if (match)
		return match;

	const possible_matches = locked_hand.filter(o => ((card = state.deck[o]) =>
		card.clued && card.clues.some(clue => clue.type === CLUE.RANK ? clue.value === rank + 1 : clue.value === suitIndex))());

	let shifts = 0;

	for (let i = locked_hand.length - 1; i >= 0; i--) {
		const card = common.thoughts[locked_hand[i]];

		// Looks like a connection
		if (card.inferred.has({ suitIndex, rank: rank + 1 }) &&
			(possible_matches.length === 0 || possible_matches.some(order => card.order === order) || shifts >= possible_matches.length)
		) {
			if (shifts < locked_shifts) {
				shifts++;
				continue;
			}
			return card.order;
		}
	}

	// No connections found
	return;
}

/**
 * Interprets a play action.
 * 
 * Impure!
 * @param  {Game} game
 * @param  {PlayAction} action
 */
export function interpret_play(game, action) {
	const { common, state } = game;
	const { playerIndex, order, suitIndex, rank } = action;
	const identity = { suitIndex, rank };

	const hand = state.hands[playerIndex];
	const other = state.nextPlayerIndex(playerIndex);
	const other_hand = state.hands[other];

	const card = common.thoughts[order];

	// Now that we know about this card, rewind from when the card was drawn
	if (playerIndex === state.ourPlayerIndex) {
		if ((card.inferred.length !== 1 || !card.inferred.array[0].matches(identity)) && !card.rewinded) {
			// If the rewind succeeds, it will redo this action, so no need to complete the rest of the function
			const new_game = game.rewind(card.drawn_index + 1, [{ type: 'identify', order, playerIndex, identities: [identity] }]);
			if (new_game) {
				new_game.updateNotes();
				Object.assign(game, new_game);
				return;
			}
		}
	}

	if (state.numPlayers !== 2) {
		let newGame = Basics.onPlay(game, action);
		Basics.mutate(game, newGame);

		for (const o of state.hands[playerIndex]) {
			if (common.thoughts[o].called_to_discard) {
				newGame.common = newGame.common.withThoughts(o, (draft) => {
					draft.called_to_discard = false;
				});
			}
		}

		newGame.common = newGame.common.good_touch_elim(state).refresh_links(state);
		newGame = team_elimP(newGame);
		Basics.mutate(game, newGame);
		return newGame;
	}

	let newGame = game.shallowCopy();

	const locked_shifts = game.locked_shifts[order];
	if (locked_shifts !== undefined)
		newGame.locked_shifts[order] = undefined;

	if (common.thinksLocked(state, other)) {
		const unlocked_order = unlock_promise(newGame, action, playerIndex, other, locked_shifts);

		if (unlocked_order !== undefined) {
			const connecting = { suitIndex, rank: rank + 1 };
			const slot = other_hand.findIndex(o => o === unlocked_order) + 1;

			// Unlocked player might have another card connecting to this
			if (hand.some(o => common.thoughts[o].identity({ infer: true })?.matches(connecting)) &&
				other_hand.some(o => common.thoughts[o].inferred.some(c => c.suitIndex === suitIndex && c.rank > rank + 1))
			) {
				logger.info(`unlocked player may have connecting ${logCard(connecting)}, not unlocking yet`);
			}
			else {
				const unlocked = common.thoughts[unlocked_order];
				if (!unlocked.inferred.has(connecting)) {
					logger.warn('no inferred connecting card!');

					if (unlocked.possible.has(connecting)) {
						logger.info(`overwriting slot ${slot} as ${logCard(connecting)} from possiilities`);
						newGame.common = newGame.common.withThoughts(unlocked_order, (draft) => {
							draft.inferred = IdentitySet.create(state.variant.suits.length, connecting);
						});
					}
					else {
						logger.warn('ignoring unlock promise');
					}
				}
				else {
					newGame.common = newGame.common.withThoughts(unlocked_order, (draft) => {
						draft.inferred = common.thoughts[unlocked_order].inferred.intersect(connecting);
					});

					logger.info(`unlocking slot ${slot} as ${logCard(connecting)}`);
					newGame.locked_shifts = [];
				}
			}
		}
		else {
			logger.info('failed to unlock');

			// Shift all other playable cards
			for (const o of common.thinksPlayables(state, playerIndex)) {
				if (o === order)
					continue;

				newGame.locked_shifts[o] = (game.locked_shifts[o] ?? 0) + 1;
			}
		}
	}
	else {
		newGame.locked_shifts = [];
	}

	newGame = Basics.onPlay(newGame, action);
	newGame.common = newGame.common.good_touch_elim(state).refresh_links(state);
	newGame = team_elimP(newGame);

	Basics.mutate(game, newGame);
	return newGame;
}
