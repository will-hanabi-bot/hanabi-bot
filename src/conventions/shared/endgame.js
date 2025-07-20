import HGroup from '../h-group.js';
import RefSieve from '../ref-sieve.js';
import { ACTION, ENDGAME_SOLVING_FUNCS } from '../../constants.js';
import { ActualCard } from '../../basics/Card.js';
import { setShortForms } from '../../variants.js';
import { trivially_winnable, simpler_cache, unwinnable_state, winnable_if, remove_remaining } from './endgame-helper.js';
import { Fraction } from '../../tools/fraction.js';
import * as Utils from '../../tools/util.js';

import logger from '../../tools/logger.js';
import { logCard, logObjectiveAction } from '../../tools/log.js';
import { produce } from '../../StateProxy.js';

import { isMainThread, parentPort, workerData } from 'worker_threads';

const conventions = {
	HGroup,
	RefSieve
};

/**
 * @typedef {import('../../basics/Game.js').Game} Game
 * @typedef {import('../../basics/State.js').State} State
 * @typedef {import('../../types.js').Identity} Identity
 * @typedef {import('../../types.js').Clue} Clue
 * @typedef {import('../../types.js').Action} Action
 * @typedef {import('../../types.js').PerformAction} PerformAction
 * 
 * @typedef {Omit<PerformAction, 'tableID'> & {playerIndex: number}} ModPerformAction
 * @typedef {{ id: Identity, missing: number, all: boolean }[]} RemainingSet
 * @typedef {{ hypo_game: Game, prob: Fraction, remaining: RemainingSet, drew?: Identity }} HypoGame
 */

export class UnsolvedGame extends Error {
	/** @param {string} message */
	constructor(message) {
		super(message);
	}
}

/** @type {Map<string, { action: ModPerformAction, winrate: Fraction }[]>} */
const simple_cache = new Map();

/** @type {number} */
let timeout;

export function getTimeout() {
	return timeout;
}

/**
 * @param {Game} game
 * @param {number} playerTurn
 * @param {(game: Game, giver: number) => Clue[]} find_clues
 * @param {(game: Game, playerIndex: number) => { misplay: boolean, order: number }[]} find_discards
 * @returns {{action: ModPerformAction, winrate: Fraction}}
 */
export function solve_game(game, playerTurn, find_clues = () => [], find_discards = () => []) {
	const { me } = game;
	const remaining_ids = find_remaining_identities(game);

	if (remaining_ids.filter(i => i.all).length > 2)
		throw new UnsolvedGame(`couldn't find any ${Array.from(remaining_ids.keys()).join()}!`);

	const state = game.state.minimalCopy();
	const unknown_own = [];

	// Write identities on our own cards
	for (const order of state.ourHand) {
		const id = me.thoughts[order].identity({ infer: true });

		if (id !== undefined)
			state.deck = state.deck.with(order, produce(state.deck[order], Utils.assignId(id)));
		else
			unknown_own.push(order);
	}

	timeout = Date.now() + 20*1000;

	const total_unknown = state.cardsLeft + unknown_own.length;
	logger.info('unknown_own', unknown_own, 'cards left', state.cardsLeft);

	if (total_unknown === 0) {
		const hypo_game = game.shallowCopy();
		hypo_game.state = state;
		const result = winnable(hypo_game, playerTurn, find_clues, find_discards, remaining_ids);

		const { action, winrate } = result[0];

		if (winrate.numerator === 0)
			throw new UnsolvedGame(`couldn't find a winning strategy`);

		logger.on();
		logger.highlight('purple', `endgame winnable! found action ${logObjectiveAction(state, action)} with winrate ${winrate.toString}`);
		return { action, winrate };
	}

	const undrawn_trash = total_unknown - remaining_ids.reduce((a, c) => a + c.missing, 0);
	const full_remaining_ids = undrawn_trash > 0 ?
		remaining_ids.concat({ id: { suitIndex: -1, rank: -1 }, missing: undrawn_trash, all: false }) :
		remaining_ids;

	logger.info('full remaining ids', full_remaining_ids);

	/**
	 * @param {{ids: Identity[], prob: Fraction, new_remaining: RemainingSet}} arrangement
	 * @returns {{ids: Identity[], prob: Fraction, new_remaining: RemainingSet}[]}
	 */
	const expand_arr = ({ ids, prob, new_remaining }) => {
		const total_cards = new_remaining.reduce((acc, curr) => acc + curr.missing, 0);

		return new_remaining.reduce((acc, { id, missing }) => {
			const order = unknown_own[ids.length];
			const thought = me.thoughts[order];

			const impossible = id.suitIndex === -1 ?
				!thought.possibilities.some(i => state.isBasicTrash(i)) :
				!thought.possibilities.has(id);

			if (impossible)
				return acc;

			const next_remaining = remove_remaining(new_remaining, id);
			acc.push({ ids: ids.concat(id), prob: prob.multiply(missing).divide(total_cards), new_remaining: next_remaining });
			return acc;
		}, []);
	};

	let arrangements = [{ ids: [], prob: new Fraction(1, 1), new_remaining: full_remaining_ids }];
	for (let i = 0; i < unknown_own.length; i++)
		arrangements = arrangements.flatMap(expand_arr);

	logger.info('arrangements', arrangements.map(({ ids, prob, new_remaining }) => ({
		ids: ids.map(logCard).join(),
		prob: prob.toString,
		remaining: JSON.stringify(new_remaining)
	})));

	const arranged_games = arrangements.length === 0 ? [{ hypo_game: game, prob: 1, remaining: [] }] : arrangements.map(({ ids, prob, new_remaining }) => {
		const new_deck = state.deck.slice();

		for (let i = 0; i < ids.length; i++) {
			const order = unknown_own[i];
			const id = ids[i];
			new_deck[order] = produce(state.deck[order], Utils.assignId(id));
		}

		const hypo_game = game.shallowCopy();
		hypo_game.state = state.shallowCopy();
		hypo_game.state.deck = new_deck;

		return { hypo_game, prob, remaining: new_remaining };
	});

	/** @type {Map<string, { winrate: Fraction, index: number }>} */
	const best_performs = new Map();

	for (const { hypo_game, prob, remaining } of arranged_games) {
		if (Date.now() > timeout)
			throw new UnsolvedGame(`timed out`);

		const { state } = hypo_game;
		logger.highlight('purple', '\narrangement', state.ourHand.map(o => logCard(state.deck[o])), prob.toString);

		const all_actions = possible_actions(hypo_game, playerTurn, find_clues, find_discards, full_remaining_ids);

		if (all_actions.length === 0)
			logger.info(`couldn't find any valid actions`);

		logger.highlight('green', `possible actions [${all_actions.map(({ action }) => logObjectiveAction(state, action))}] ${state.hands[playerTurn].map(o => logCard(state.deck[o]))} ${state.hands[playerTurn]} ${state.endgameTurns}`);

		const hypo_games = gen_hypo_games(hypo_game, all_actions, remaining);
		const { best_winrate, best_actions } = optimize(hypo_games, all_actions, playerTurn, find_clues, find_discards);

		if (best_winrate.numerator !== 0) {
			logger.highlight('purple', `endgame winnable! found actions ${best_actions.map(action => logObjectiveAction(state, action))} with winrate ${best_winrate.toString}`);

			for (const action of best_actions) {
				const entry = best_performs.get(JSON.stringify(action));

				if (entry === undefined)
					best_performs.set(JSON.stringify(action), { winrate: best_winrate.multiply(prob), index: best_performs.size });
				else
					entry.winrate = entry.winrate.plus(best_winrate.multiply(prob));
			}
		}
	}

	if (Date.now() > timeout)
		throw new UnsolvedGame(`timed out`);

	if (best_performs.size == 0)
		throw new UnsolvedGame(`couldn't find a winning strategy`);

	const [action, { winrate }] = Utils.maxOn(Array.from(best_performs.entries()), ([_, { winrate, index}]) =>
		winrate.multiply(1000).subtract(index).toDecimal
	);

	return { action: JSON.parse(action), winrate };
}

/**
 * @param {Game} game
 * @returns {RemainingSet}
 */
function find_remaining_identities(game) {
	const { state, me } = game;

	/** @type {Record<string, number>} */
	const seen_identities = state.hands.reduce((id_map, hand) => {
		for (const o of hand) {
			const id = me.thoughts[o].identity({ infer: true, symmetric: false });
			if (id !== undefined) {
				id_map[logCard(id)] ??= 0;
				id_map[logCard(id)]++;
			}
		}
		return id_map;
	}, {});

	/** @type {RemainingSet} */
	const map = [];

	for (let suitIndex = 0; suitIndex < state.variant.suits.length; suitIndex++) {
		const stack = state.play_stacks[suitIndex];
		if (stack === state.max_ranks[suitIndex])
			continue;

		for (let rank = stack + 1; rank <= state.max_ranks[suitIndex]; rank++) {
			const id = { suitIndex, rank };
			const total = state.cardCount(id);
			const missing = Math.max(0, total - state.baseCount(id) - (seen_identities[logCard(id)] ?? 0));

			if (missing > 0)
				map.push({ id, missing, all: missing === total });
		}
	}

	return map;
}

/**
 * @param {Game} game
 * @param {number} playerTurn
 * @param {ModPerformAction} action
 */
function advance_game(game, playerTurn, action) {
	const { state } = game;

	if (action.target !== -1)
		return game.simulate_action(Utils.performToAction(state, action, playerTurn, state.deck));

	return produce(game, (draft) => {
		draft.state.clue_tokens--;
		draft.state.turn_count++;

		if (state.endgameTurns !== -1)
			draft.state.endgameTurns--;
	});
}

/**
 * @param {Game} game
 * @param {number} playerTurn
 * @param {(game: Game, giver: number) => Clue[]} find_clues
 * @param {(game: Game, playerIndex: number) => { misplay: boolean, order: number }[]} find_discards
 * @param {RemainingSet} remaining_ids
 */
function possible_actions(game, playerTurn, find_clues, find_discards, remaining_ids) {
	const { state } = game;
	const actions = /** @type {{ action: ModPerformAction, winnable_draws: Identity[] }[]} */ ([]);

	if (Date.now() > timeout)
		return [];

	const playables = game.players[playerTurn].thinksPlayables(state, playerTurn);
	for (const order of playables) {
		if (state.deck[order].identity() === undefined)
			continue;

		const action = { type: ACTION.PLAY, target: order, playerIndex: playerTurn };
		const { winnable, winnable_draws } = winnable_if(state, playerTurn, action, remaining_ids);

		if (winnable)
			actions.push({ action, winnable_draws });
	}

	let consecutive_clues = 0;
	for (let i = state.actionList.length - 1; i >= 0; i--) {
		const actions = state.actionList[i];

		if (actions?.some(a => a.type == 'clue'))
			consecutive_clues++;
		else if (actions?.some(a => a.type == 'play' || a.type == 'discard'))
			break;
	}
	const too_many_clues = consecutive_clues > state.numPlayers;
	const clue_winnable = !too_many_clues && winnable_if(state, playerTurn, { type: ACTION.RANK, target: -1, value: -1, playerIndex: playerTurn }, remaining_ids).winnable;
	let attempted_clue = false;

	if (state.clue_tokens > 0 && clue_winnable) {
		const clues = find_clues(game, playerTurn);

		for (const clue of clues) {
			const action = Object.assign(Utils.clueToAction(clue, -1), { playerIndex: playerTurn });
			attempted_clue = true;

			actions.push({ action, winnable_draws: [] });
		}
	}

	if (state.pace > 0) {
		const not_useful = state.hands[playerTurn].find(o => state.isBasicTrash(state.deck[o]));
		const discards = find_discards(game, playerTurn);

		if (discards.length === 0 && not_useful !== undefined)
			discards.push({ misplay: false, order: not_useful });

		for (const { misplay, order } of discards) {
			if (!misplay && state.clue_tokens === 8)
				continue;

			const action = { type: misplay ? ACTION.PLAY : ACTION.DISCARD, target: order, playerIndex: playerTurn };
			const { winnable, winnable_draws } = winnable_if(state, playerTurn, action, remaining_ids);

			if (winnable)
				actions.push({ action, winnable_draws });
		}
	}

	if (state.clue_tokens > 0 && clue_winnable && !attempted_clue)
		actions.push({ action: { type: ACTION.RANK, target: -1, value: -1, playerIndex: playerTurn }, winnable_draws: [] });

	return actions;
}

/**
 * @param {Game} game
 * @param {{ action: ModPerformAction, winnable_draws: Identity[] }[]} actions
 * @param {RemainingSet} remaining_ids
 * @returns {{ undrawn: HypoGame[], drawn: HypoGame[] }}
 */
function gen_hypo_games(game, actions, remaining_ids) {
	const default_game = { hypo_game: game, prob: new Fraction(1, 1), remaining: remaining_ids };

	if (actions.every(({ action }) => action.type === ACTION.COLOUR || action.type === ACTION.RANK))
		return { undrawn: [default_game], drawn: [] };

	const { state } = game;

	/** @type {HypoGame[]} */
	const hypo_games = [];

	// TODO: If an arrangement is bottom-decked, it's automatically a loss.
	for (let i = 0; i < remaining_ids.length; i++) {
		const { id, missing } = remaining_ids[i];

		const new_deck = state.deck.slice();
		new_deck[state.cardOrder + 1] = Object.freeze(new ActualCard(id.suitIndex, id.rank, state.cardOrder + 1));

		const new_remaining_ids = missing === 1 ?
			remaining_ids.toSpliced(i, 1) :
			remaining_ids.with(i, { ...remaining_ids[i], missing: missing - 1 });

		const hypo_game = game.shallowCopy();
		hypo_game.state = game.state.shallowCopy();
		hypo_game.state.deck = new_deck;

		hypo_games.push({ hypo_game, prob: new Fraction(missing, state.cardsLeft), remaining: new_remaining_ids, drew: id });
	}

	if (hypo_games.length === 0)
		hypo_games.push(default_game);

	return { undrawn: [default_game], drawn: hypo_games };
}

/**
 * @param {Game} game
 * @param {number} playerTurn
 * @param {(game: Game, giver: number) => Clue[]} find_clues
 * @param {(game: Game, playerIndex: number) => { misplay: boolean, order: number }[]} find_discards
 * @param {RemainingSet} remaining_ids
 * @param {number} depth
 * @returns {{action: ModPerformAction, winrate: Fraction}[]}
 */
function winnable(game, playerTurn, find_clues, find_discards, remaining_ids, depth = 0) {
	const { state } = game;
	const hash = `${game.hash},${playerTurn}`;
	const FAILURE = [{ action: undefined, winrate: new Fraction(0, 1) }];

	const cached_result = simple_cache.get(hash);
	if (cached_result !== undefined)
		return cached_result;

	const { trivial, action } = trivially_winnable(game, playerTurn);

	if (trivial) {
		simple_cache.set(hash, [{ action, winrate: new Fraction(1, 1) }]);
		return [{ action, winrate: new Fraction(1, 1) }];
	}

	if (Date.now() > timeout)
		throw new UnsolvedGame(`timed out`);

	const bottom_decked = remaining_ids.length > 0 && remaining_ids.every(({ id }) => state.isCritical(id) && id.rank !== 5);

	if (unwinnable_state(state, playerTurn) || bottom_decked) {
		simple_cache.set(hash, FAILURE);
		return FAILURE;
	}

	const actions = possible_actions(game, playerTurn, find_clues, find_discards, remaining_ids);

	if (actions.length === 0)
		return FAILURE;

	logger.highlight('green', `${Array.from({ length: depth }, _ => '  ').join('')}possible actions [${actions.map(({ action }) => logObjectiveAction(state, action))}] ${state.hands[playerTurn].map(o => logCard(state.deck[o]))} ${state.hands[playerTurn]} ${state.endgameTurns}`);

	const hypo_games = gen_hypo_games(game, actions, remaining_ids);
	const { best_winrate, best_actions } = optimize(hypo_games, actions, playerTurn, find_clues, find_discards, depth);

	const result = best_actions.map(a => ({ action: a, winrate: best_winrate }));
	simple_cache.set(hash, result);
	return result;
}

/**
 * @param {{drawn: HypoGame[], undrawn: HypoGame[]}} hypo_games
 * @param {{ action: ModPerformAction, winnable_draws: Identity[] }[]} actions
 * @param {number} playerTurn
 * @param {(game: Game, giver: number) => Clue[]} find_clues
 * @param {(game: Game, playerIndex: number) => { misplay: boolean, order: number }[]} find_discards
 * @param {number} depth
 * @returns {{ best_winrate: Fraction, best_actions: ModPerformAction[] }}
 */
function optimize({ undrawn, drawn }, actions, playerTurn, find_clues, find_discards, depth = 0) {
	const nextPlayerIndex = undrawn[0].hypo_game.state.nextPlayerIndex(playerTurn);
	let best_winrate = new Fraction(0, 1), best_actions = [];

	for (const { action, winnable_draws } of actions) {
		let all_winrate = new Fraction(0, 1);
		let rem_prob = new Fraction(1, 1);

		const hypo_games = (action.type === ACTION.RANK || action.type === ACTION.COLOUR) ? undrawn : drawn;

		for (const { hypo_game, prob, remaining, drew } of hypo_games) {
			// Drew an unwinnable card
			if (drew !== undefined && !winnable_draws.some(id => id.suitIndex === drew.suitIndex && id.rank === drew.rank)) {
				logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}drew ${logCard(drew)} unwinnable ${JSON.stringify(winnable_draws)}`);
				continue;
			}

			if (Date.now() > timeout)
				throw new UnsolvedGame(`timed out`);

			const new_game = advance_game(hypo_game, playerTurn, action);

			// Some critical was lost
			if (new_game.state.maxScore < hypo_game.state.maxScore)
				continue;

			if (action.type === ACTION.PLAY || action.type === ACTION.DISCARD)
				logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}drawing ${logCard(new_game.state.deck[new_game.state.cardOrder])} after ${logObjectiveAction(new_game.state, action)} ${new_game.state.hands[playerTurn].map(o => logCard(new_game.state.deck[o]))} ${new_game.state.cardsLeft} ${new_game.state.endgameTurns} {`);
			else
				logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}${logObjectiveAction(new_game.state, action)} cardsLeft ${new_game.state.cardsLeft} endgameTurns ${new_game.state.endgameTurns} {`);

			const { action: best_action, winrate } = winnable(new_game, nextPlayerIndex, find_clues, find_discards, remaining, depth + 1)[0] ?? {};

			if (Date.now() > timeout)
				return { best_winrate, best_actions: [] };

			logger.info(`${Array.from({ length: depth }, _ => '  ').join('')}} ${best_action && logObjectiveAction(new_game.state, best_action)} prob ${prob.toString} winrate ${winrate.toString}`);

			all_winrate = all_winrate.plus(prob.multiply(winrate));
			rem_prob = rem_prob.subtract(prob);

			// Winning the remaining hypo games can't bring the winrate of this action high enough
			if (all_winrate.plus(rem_prob).lessThan(best_winrate))
				break;
		}

		if (depth === 0)
			logger.info('action', logObjectiveAction(undrawn[0].hypo_game.state, action), all_winrate.toString);

		if (all_winrate.equals(new Fraction(1, 1)))
			return { best_winrate: all_winrate, best_actions: [action] };

		if (best_winrate.lessThan(all_winrate)) {
			best_winrate = all_winrate;
			best_actions = [action];
		}
		else if (all_winrate.equals(best_winrate)) {
			best_actions.push(action);
		}
	}

	return { best_winrate, best_actions };
}

if (!isMainThread) {
	const game = conventions[workerData.conv].fromJSON(workerData.game);
	Utils.globalModify({ game });

	setShortForms(workerData.shortForms);

	simple_cache.clear();
	simpler_cache.clear();

	logger.setLevel(workerData.logLevel);
	logger.off();

	const { find_clues, find_discards } = ENDGAME_SOLVING_FUNCS[workerData.conv];

	try {
		const { action } = solve_game(game, workerData.playerTurn, find_clues, find_discards);
		parentPort.postMessage({ success: true, action });
	}
	catch (err) {
		if (err instanceof UnsolvedGame)
			parentPort.postMessage({ success: false, err });
		else
			throw err;
	}
}
