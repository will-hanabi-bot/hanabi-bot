import * as fs from 'fs';

import HGroup from './conventions/h-group.js';
import PlayfulSieve from './conventions/playful-sieve.js';
import { ACTION, END_CONDITION, HAND_SIZE, MAX_H_LEVEL } from './constants.js';
import { cardCount, getVariant } from './variants.js';
import * as Utils from './tools/util.js';

import logger from './tools/logger.js';

/**
 * @typedef {import('./basics/State.js').State} State
 * @typedef {import('./types.js').BasicCard} BasicCard
 * @typedef {import('./types.js').Action} Action
 * @typedef {import('./types.js').PerformAction} PerformAction
 */

const conventions = /** @type {const} */ ({
	HGroup,
	PlayfulSieve
});

const playerNames = ['Alice', 'Bob', 'Cathy', 'Donald', 'Emily', 'Fred'];

async function main() {
	const { convention = 'HGroup', level: lStr = '1', games = '10', players: pStr = '2', variant: vStr = 'No Variant' } = Utils.parse_args();
	const variant = await getVariant(vStr);

	if (conventions[convention] === undefined) {
		throw new Error(`Convention ${convention} is not supported.`);
	}

	const numPlayers = Number(pStr);

	if (!Number.isInteger(numPlayers) || numPlayers < 2 || numPlayers > 6) {
		throw new Error(`Invalid number of players (${pStr}). Please enter a number from 2-6.`);
	}

	const level = Number(lStr);

	if (convention === 'HGroup' && (!Number.isInteger(level) || level < 1 || level > MAX_H_LEVEL)) {
		throw new Error(`Invalid level provided (${lStr}). Please enter a number from 1-${MAX_H_LEVEL}.`);
	}

	/** @type {BasicCard[]} */
	const deck = [];

	for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
		for (let rank = 1; rank <= 5; rank++) {
			const identity = Object.freeze({ suitIndex, rank });

			for (let i = 0; i < cardCount(variant.suits, identity); i++) {
				deck.push(identity);
			}
		}
	}

	logger.setLevel(logger.LEVELS.ERROR);

	fs.mkdir('./seeds', { recursive: true }, (err) => console.log(err));

	for (let i = 0; i < Number(games); i++) {
		const players = playerNames.slice(0, numPlayers);
		const shuffled = shuffle(deck, `${i}`);
		const { score, strikeout, actions } =
			simulate_game(players, shuffled, variant.suits, /** @type {keyof typeof conventions} */ (convention), level);

		fs.writeFileSync(`seeds/seed_${i}.json`, JSON.stringify({ players, deck: shuffled, actions }));
		console.log(score, strikeout);
	}
}

/**
 * Given a deck, simulates the outcome of the game in self-play with the provided conventions.
 * Returns the score of the game.
 * @param {string[]} playerNames
 * @param {BasicCard[]} deck
 * @param {string[]} suits
 * @param {keyof typeof conventions} convention
 * @param {number} level
 */
function simulate_game(playerNames, deck, suits, convention, level) {
	/** @type {{ state: State, order: number }[]} */
	const states = playerNames.map((_, index) => {
		return { state: new conventions[convention](-1, playerNames, index, suits, false, level), order: 0 };
	});
	Utils.globalModify({ state: states[0].state });

	const handSize = HAND_SIZE[playerNames.length];

	for (let stateIndex = 0; stateIndex < playerNames.length; stateIndex++) {
		const { state } = states[stateIndex];

		// Draw cards in starting hands
		for (let playerIndex = 0; playerIndex < playerNames.length; playerIndex++) {
			for (let j = 0; j < handSize; j++) {
				const { order } = states[stateIndex];
				const { suitIndex, rank } = playerIndex !== state.ourPlayerIndex ? deck[order] : { suitIndex: -1, rank: -1 };

				state.handle_action({ type: 'draw', playerIndex, order, suitIndex, rank }, true);
				states[stateIndex].order++;
			}
		}
	}

	let currentPlayerIndex = 0, turn = 0, endgameTurns = -1;

	/** @type {Pick<PerformAction, 'type' | 'target' | 'value'>[]} */
	const actions = [];

	while (endgameTurns !== 0 && states[0].state.strikes !== 3) {
		if (turn !== 0) {
			states.forEach(({ state }) => {
				Utils.globalModify({ state });
				state.handle_action({ type: 'turn', num: turn, currentPlayerIndex });
			}, true);
		}

		const { state: currentPlayerState } = states[currentPlayerIndex];
		Utils.globalModify({ state: currentPlayerState });

		const performAction = currentPlayerState.take_action(currentPlayerState);
		actions.push(Utils.objPick(performAction, ['type', 'target', 'value'], { default: 0 }));

		for (let stateIndex = 0; stateIndex < playerNames.length; stateIndex++) {
			const { state, order } = states[stateIndex];
			const action = Utils.performToAction(state, performAction, currentPlayerIndex, deck);

			Utils.globalModify({ state });
			state.handle_action(action, true);

			if ((action.type === 'play' || action.type === 'discard') && order < deck.length) {
				const { suitIndex, rank } = (currentPlayerIndex !== state.ourPlayerIndex) ? deck[order] : { suitIndex: -1, rank: -1 };
				state.handle_action({ type: 'draw', playerIndex: currentPlayerIndex, order, suitIndex, rank }, true);
				states[stateIndex].order++;
			}
		}

		if (states[currentPlayerIndex].order === deck.length && endgameTurns === -1) {
			endgameTurns = playerNames.length;
		}
		else if (endgameTurns > 0) {
			endgameTurns--;
		}

		currentPlayerIndex = (currentPlayerIndex + 1) % playerNames.length;
		turn++;
	}

	actions.push({
		type: ACTION.END_GAME,
		target: (currentPlayerIndex + playerNames.length - 1) % playerNames.length,
		value: endgameTurns === 0 ? END_CONDITION.NORMAL : END_CONDITION.STRIKEOUT
	});

	return {
		score: states[0].state.play_stacks.reduce((acc, stack) => acc + stack),
		strikeout: states[0].state.strikes === 3,
		actions
	};
}

main();

/**
 * Generates pseudo-random numbers using the Simple Fast Counter (SFC) algorithm.
 * Requires four 32-bit component hashes.
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 */
function sfc32(a, b, c, d) {
	return function() {
		a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
		var t = (a + b) | 0;
		a = b ^ b >>> 9;
		b = c + (c << 3) | 0;
		c = (c << 21 | c >>> 11);
		d = d + 1 | 0;
		t = t + d | 0;
		c = c + t | 0;
		return (t >>> 0) / 4294967296;
	};
}

/**
 * Generates a 128-bit hash value from a string.
 * @param {string} str
 */
function cyrb128(str) {
	let h1 = 1779033703, h2 = 3144134277,
		h3 = 1013904242, h4 = 2773480762;
	for (let i = 0, k; i < str.length; i++) {
		k = str.charCodeAt(i);
		h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
		h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
		h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
		h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	h1 ^= (h2 ^ h3 ^ h4), h2 ^= h1, h3 ^= h1, h4 ^= h1;
	return [h1>>>0, h2>>>0, h3>>>0, h4>>>0];
}

/**
 * Returns a shallow copy of the array after shuffling it according to a seed. The original array is not modified.
 * @template T
 * @param {T[]} array
 * @param {string} seed
 */
function shuffle(array, seed) {
	const hash = cyrb128(seed);
	const rand = sfc32(hash[0], hash[1], hash[2], hash[3]);
	const arr = array.slice();

	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}

	return arr;
}
