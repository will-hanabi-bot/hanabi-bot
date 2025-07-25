import { ACTION } from '../../constants.js';
import { ACTION_PRIORITY as PRIORITY, LEVEL, CLUE_INTERP } from './h-constants.js';
import { get_result } from './clue-finder/determine-clue.js';
import { playersBetween, unknown_1, valuable_tempo_clue } from './hanabi-logic.js';
import { cardValue, save2 } from '../../basics/hanabi-util.js';
import { find_clue_value, order_1s } from './action-helper.js';
import { find_expected_clue, save_clue_value } from './clue-finder/clue-finder.js';
import { cardTouched } from '../../variants.js';
import { find_sarcastics } from '../shared/sarcastic.js';
import * as Utils from '../../tools/util.js';

import logger from '../../tools/logger.js';
import { logCard, logClue } from '../../tools/log.js';
import { produce } from '../../StateProxy.js';

/**
 * @typedef {import('../h-group.js').default} Game
 * @typedef {import('../../basics/State.js').State} State
 * @typedef {import('../../basics/Card.js').ActualCard} ActualCard
 * @typedef {import('../../basics/Card.js').Card} Card
 * @typedef {import('../../types.js').Clue} Clue
 * @typedef {import('../../types.js').SaveClue} SaveClue
 * @typedef {import('../../types.js').FixClue} FixClue
 * @typedef {import('../../types.js').PerformAction} PerformAction
 */

/**
 * Determines whether the order can be placed into anxiety.
 * @param {Game} game
 * @param {number} target
 * @param {number} order
 * @returns {boolean}
 */
export function anxiety_targetable(game, target, order) {
	const { common, state } = game;

	return game.level >= LEVEL.STALLING &&
			common.thinksLocked(state, target) &&
			state.clue_tokens === 0 &&
			game.players[target].anxietyPlay(state, state.hands[target]) === order;
}

/**
 * Determines whether we can play a connecting card into the target's hand.
 * @param {Game} game
 * @param {number} target
 * @returns {number | undefined}	The order of the card to play, otherwise undefined.
 */
export function find_unlock(game, target) {
	const { common, me, state } = game;

	for (const order of state.hands[target]) {
		const card = state.deck[order];
		const { suitIndex, rank } = card;

		if (state.playableAway(card) !== 1)
			continue;

		// See if we have the connecting card (should be certain)
		const our_connecting = state.ourHand.find(o => me.thoughts[o].matches({ suitIndex, rank: rank - 1 }, { infer: true }));
		if (our_connecting === undefined)
			continue;

		// The card must become playable (TODO: maybe anxiety should only be on next player?)
		const known = game.players[target].thoughts[order].inferred.every(c => state.isPlayable(c) || c.matches(card)) || anxiety_targetable(game, target, order);

		if (known) {
			// Reorder if unknown 1 (e.g. we have a good touch link for the last remaining 1)
			if (unknown_1(state.deck[our_connecting])) {
				const ordered_1s = order_1s(state, common, state.ourHand.filter(o => me.thoughts[o].matches({ suitIndex, rank: rank - 1 }, { infer: true })));

				if (ordered_1s.length > 0)
					return ordered_1s[0];
			}
			return our_connecting;
		}
	}
	return;
}

/**
 * Looks for a play clue that can be given to avoid giving a save clue to the target.
 * @param {Game} game
 * @param {number} target 			The index of the player that needs a save clue.
 * @param {Clue[]} all_play_clues 	An array of all valid play clues that can be currently given.
 * @param {SaveClue} [save_clue]	The save clue that may need to be given (undefined if the target is simply locked).
 * @returns {Clue[]}				Possible plays over saves.
 */
function find_play_over_save(game, target, all_play_clues, save_clue) {
	const { common, state } = game;

	return all_play_clues.filter(clue => {
		// Unsafe play clue
		if (!clue.result.safe)
			return false;

		// Check if the play clue touches all the cards that need to be saved
		if (save_clue !== undefined && clue.target === target) {
			if (save_clue.cm?.length > 0) {
				if (save_clue.cm.every(o => cardTouched(state.deck[o], state.variant, clue)))
					return true;
			}
			else if (cardTouched(state.deck[common.chop(state.hands[target])], state.variant, clue)) {
				return true;
			}
		}
		// Locked reduces needed clue value
		if (find_clue_value(clue.result) < (save_clue === undefined ? 0 : 1))
			return false;

		const { playables } = clue.result;
		const target_cards = playables.filter(({ playerIndex }) => playerIndex === target).map(p => p.card);
		const immediately_playable = target_cards.filter(card =>
			state.isPlayable(state.deck[card.order]) && card.inferred.every(i => state.isPlayable(i)));

		// The card can be played without any additional help
		if (immediately_playable.length > 0)
			return true;

		// Try to see if any target card can be made playable by players between us and them, including themselves
		for (const { order } of target_cards) {
			const { suitIndex, rank } = state.deck[order];
			let stackRank = state.play_stacks[suitIndex];

			for (let i = 1; i <= state.numPlayers; i++) {
				const nextPlayer = (state.ourPlayerIndex + i) % state.numPlayers;

				if (nextPlayer === target) {
					if (stackRank + 1 === rank)
						return true;

					break;
				}

				const common_playables = common.thinksPlayables(state, nextPlayer);
				const connecting_playable =
					playables.some(p => p.playerIndex === nextPlayer && p.card.matches({ suitIndex, rank: stackRank + 1 })) ||
					common_playables.some(o => state.deck[o].matches({ suitIndex, rank: stackRank + 1 }));

				if (connecting_playable)
					stackRank++;
			}
		}
		return false;
	});
}

/**
 * @param {Game} game
 * @param {number} giver
 * @param {number} [exceptTarget]
 */
export function early_game_clue(game, giver, exceptTarget = -1) {
	if (game.state.clue_tokens <= 0)
		return false;

	const { state } = game;
	const hypo_game = produce(game, (draft) => {
		draft.state.discard_state = undefined;
	});

	/**
	 * @param {Game} _game
	 * @param {Clue} _clue
	 * @param {{interp: typeof CLUE_INTERP[keyof typeof CLUE_INTERP]}} res
	 */
	const satisfied = (_game, _clue, { interp }) => interp === CLUE_INTERP.STALL_5 && game.level >= 2 && !game.stalled_5;

	const result = find_expected_clue(hypo_game, giver, satisfied, (clue) => clue.target === exceptTarget).next();

	if (result.done === false) {
		const { clue } = result.value;
		logger.highlight('yellow', `expecting ${state.playerNames[giver]} to give ${logClue(clue)} in early game`);
		return true;
	}

	return false;
}

/**
 * @param {Game} game
 * @param {number} target
 */
export function find_gd(game, target) {
	const { common, me, state } = game;
	const connected = /** @type {number[]} */([]);

	let finesse = common.find_finesse(state, target);
	const playables = common.thinksPlayables(state, state.ourPlayerIndex);

	while (finesse !== undefined && state.isPlayable(state.deck[finesse])) {
		const match = playables.find(c => me.thoughts[c].matches(state.deck[finesse], { infer: true }));

		if (match !== undefined && find_sarcastics(state, target, common, state.deck[finesse]).every(o => state.isPlayable(state.deck[o])))
			return match;

		connected.push(finesse);
		finesse = common.find_finesse(state, target, connected);
	}
}

/**
 * Returns a 2D array of urgent actions in order of descending priority.
 * @param {Game} game
 * @param {Clue[][]} play_clues
 * @param {SaveClue[]} save_clues
 * @param {FixClue[][]} fix_clues
 * @param {Clue[][]} stall_clues
 * @param {number[][]} playable_priorities
 * @param {number} [finessed_order]
 */
export function find_urgent_actions(game, play_clues, save_clues, fix_clues, stall_clues, playable_priorities, finessed_order = -1) {
	const { common, me, state, tableID } = game;
	const prioritySize = Object.keys(PRIORITY).length;
	const urgent_actions = /** @type {PerformAction[][]} */ (Array.from({ length: prioritySize * 2 + 1 }, _ => []));
	const urgent_clues = /** @type {Clue[][]} */ (Array.from({ length: prioritySize * 2 + 1 }, _ => []));
	const finessed_card = state.deck[finessed_order];

	for (let i = 1; i < state.numPlayers; i++) {
		const target = (state.ourPlayerIndex + i) % state.numPlayers;

		const early_expected_clue = state.early_game && early_game_clue(game, target);
		const potential_cluers = playersBetween(state.numPlayers, state.ourPlayerIndex, target).filter(i =>
			i !== target && !state.hands[i].some(o => common.thoughts[o].blind_playing && state.isPlayable(state.deck[o]))).length;

		const nextPriority = (potential_cluers === 0 && !early_expected_clue) ? 0 : prioritySize;
		const locked = state.hands[target].every(o => common.thoughts[o].saved || state.isCritical(state.deck[o])) && !common.thinksLoaded(state, target);

		// They are locked (or will be locked), we should try to unlock
		if (locked) {
			let anxiety = false;

			for (const o of playable_priorities.flat()) {
				const id = me.thoughts[o].identity({ infer: true });

				if (id === undefined)
					continue;

				const stacks = state.play_stacks.with(id.suitIndex, id.rank);
				if (state.hands[target].some(order => stacks[state.deck[order].suitIndex] + 1 === state.deck[order].rank && anxiety_targetable(game, target, order))) {
					urgent_actions[PRIORITY.UNLOCK + nextPriority].push({ tableID, type: ACTION.PLAY, target: o });
					anxiety = true;
					break;
				}
			}

			if (anxiety)
				continue;

			const unlock_order = find_unlock(game, target);
			if (unlock_order !== undefined && (finessed_order === -1 || finessed_order == unlock_order)) {
				urgent_actions[PRIORITY.UNLOCK + nextPriority].push({ tableID, type: ACTION.PLAY, target: unlock_order });
				continue;
			}

			if (state.clue_tokens > 0 && !finessed_card) {
				const play_over_save = find_play_over_save(game, target, play_clues.flat());
				if (play_over_save.length > 0) {
					for (const clue of play_over_save)
						urgent_clues[PRIORITY.PLAY_OVER_SAVE + nextPriority].push(clue);

					continue;
				}

				const trash_fixes = fix_clues[target].filter(clue => clue.trash);
				if (!finessed_card && trash_fixes.length > 0) {
					const trash_fix = Utils.maxOn(trash_fixes, ({ result }) => find_clue_value(result));
					urgent_clues[PRIORITY.TRASH_FIX + nextPriority].push(trash_fix);
					continue;
				}
			}

			if (common.thinksLocked(state, target))
				continue;
		}

		const save = (() => {
			if (save_clues[target] !== undefined)
				return save_clues[target];

			// Check if a play clue focuses chop and is worth giving as a save
			const chop_plays = play_clues[target].filter(clue => clue.result.focus === common.chop(state.hands[target]));
			const best_chop_play = Utils.maxOn(chop_plays, clue => find_clue_value(clue.result));

			if (best_chop_play === undefined)
				return undefined;

			const play_save = { ...best_chop_play, playable: true, cm: [], safe: best_chop_play.result.safe };
			return save_clue_value(game, undefined, play_save, []) > 0 ? play_save : undefined;
		})();

		// They require a save clue
		// Urgency: [next, unlock] [next, save only] [next, play/trash fix over save] [next, urgent fix] [other, unlock]
		// (play) (give play if 2+ clues)
		// [other, save only] [other, play/trash fix over save] [all other fixes]
		// (give play if < 2 clues) [early saves]
		if (save !== undefined) {
			if (save_clues[target] === undefined)
				logger.highlight('yellow', 'treating play clue', logClue(save), 'as save!');

			const result = save_urgency(game, save, nextPriority, potential_cluers, early_expected_clue, play_clues, fix_clues, stall_clues, playable_priorities, finessed_card);

			if (result !== undefined) {
				const { urgency, clue, action } = result;

				if (clue !== undefined)
					urgent_clues[urgency].push(clue);
				else
					urgent_actions[urgency].push(action);
			}
		}

		// They require a fix clue
		if (state.clue_tokens > 0 && !finessed_card && fix_clues[target].length > 0) {
			const urgent_fixes = fix_clues[target].filter(clue => clue.urgent);

			// Urgent fix on the next player is particularly urgent, but we should prioritize urgent fixes for others too
			if (urgent_fixes.length > 0) {
				const urgent_fix = Utils.maxOn(urgent_fixes, ({ result }) => find_clue_value(result));
				const fixPriority = potential_cluers === 0 ? 0 : prioritySize;

				urgent_clues[PRIORITY.URGENT_FIX + fixPriority].push(urgent_fix);
				continue;
			}

			const best_fix = Utils.maxOn(fix_clues[target], ({ result }) => find_clue_value(result));

			// No urgent fixes required
			urgent_clues[PRIORITY.URGENT_FIX + prioritySize].push(best_fix);
		}
	}

	for (let i = 0; i < urgent_actions.length; i++) {
		// Sort clues in decreasing order of value
		const clues = urgent_clues[i].sort((a, b) => find_clue_value(b.result) - find_clue_value(a.result));

		// Prefer other actions over clues
		for (const clue of clues)
			urgent_actions[i].push(Utils.clueToAction(clue, tableID));
	}

	return urgent_actions;
}

/**
 * @param {Game} game
 * @param {SaveClue} save
 * @param {number} nextPriority
 * @param {number} potential_cluers
 * @param {boolean} early_expected_clue
 * @param {Clue[][]} play_clues
 * @param {FixClue[][]} fix_clues
 * @param {Clue[][]} stall_clues
 * @param {number[][]} playable_priorities
 * @param {ActualCard | undefined} finessed_card
 * @returns {{ urgency: number, action?: PerformAction, clue?: Clue }}
 */
function save_urgency(game, save, nextPriority, potential_cluers, early_expected_clue, play_clues, fix_clues, stall_clues, playable_priorities, finessed_card) {
	const { common, me, state, tableID } = game;
	const { target } = save;
	const hand = state.hands[target];
	const prioritySize = Object.keys(PRIORITY).length;

	// They already have a playable or trash (i.e. early save)
	if (common.thinksLoaded(state, target, {assume: false}))
		return { urgency: prioritySize * 2, clue: save };

	// Try to see if they have a playable card that connects directly through our hand
	// Although this is only optimal for the next player, it is often a "good enough" action for future players.
	const unlock_order = find_unlock(game, target);
	if (unlock_order !== undefined && (!finessed_card || finessed_card.order == unlock_order))
		return { urgency: PRIORITY.UNLOCK + nextPriority, action: { tableID, type: ACTION.PLAY, target: unlock_order }};

	if (!state.inEndgame() && game.level >= LEVEL.SPECIAL_DISCARDS) {
		const gd_target = find_gd(game, target);

		if (gd_target !== undefined)
			return { urgency: PRIORITY.UNLOCK + nextPriority, action: { tableID, type: ACTION.DISCARD, target: gd_target } };
	}

	const list = state.clueTouched(hand, save);

	// Give them a fix clue with known trash if possible (TODO: Re-examine if this should only be urgent fixes)
	const trash_fixes = fix_clues[target].filter(clue => clue.trash);
	if (state.clue_tokens > 0 && !finessed_card && trash_fixes.length > 0) {
		const trash_fix = Utils.maxOn(trash_fixes, ({ result }) => find_clue_value(result));
		return { urgency: PRIORITY.TRASH_FIX + nextPriority, clue: trash_fix };
	}

	// Check if Order Chop Move is available - they must be 1s, and this cannot be a playable save
	if (!finessed_card && game.level >= LEVEL.BASIC_CM && !save.playable) {
		const ordered_1s = order_1s(state, common, playable_priorities[4]);
		const distance = (target + state.numPlayers - state.ourPlayerIndex) % state.numPlayers;

		// If we want to OCM the next player (distance 1), we need at least two unknown 1s.
		if (ordered_1s.length > distance) {
			// Temporarily chop move the chop card
			const chop = me.chop(hand);
			const old_chop_value = cardValue(state, me, state.deck[chop]);
			const new_chop_value = me.simulateCM([chop]).chopValue(state, target);

			// Make sure the old chop is equal or better than the new one
			if (old_chop_value >= new_chop_value) {
				return {
					urgency: PRIORITY.ONLY_SAVE + nextPriority,
					action: { tableID, type: ACTION.PLAY, target: ordered_1s[distance] }
				};
			}
		}
	}

	const scream_available = !finessed_card &&
		!state.inEndgame() &&
		game.level >= LEVEL.LAST_RESORTS &&
		common.thinksPlayables(state, state.ourPlayerIndex).length > 0 &&
		target === state.nextPlayerIndex(state.ourPlayerIndex) &&
		!me.thinksLoaded(state, target);

	if (scream_available) {
		const trash = me.thinksTrash(state, state.ourPlayerIndex).filter(o =>
			state.deck[o].clued && me.thoughts[o].inferred.every(i => state.isBasicTrash(i)));

		if (trash.length > 0)
			return { urgency: PRIORITY.PLAY_OVER_SAVE + nextPriority, action: { tableID, type: ACTION.DISCARD, target: trash[0] } };

		// As a last resort, only scream discard if it is playable or critical.
		const save_card = state.deck[game.players[target].chop(state.hands[target])];
		const chop = common.chop(state.ourHand);

		const screamed_player = game.players[target].simulateCM([save_card.order]);

		const valid_scream = (state.isCritical(save_card) || me.hypo_stacks[save_card.suitIndex] + 1 === save_card.rank) &&
			(state.clue_tokens === 0 || (state.clue_tokens === 1 && screamed_player.thinksLocked(state, target))) &&
			chop !== undefined;

		if (valid_scream)
			return { urgency: PRIORITY.PLAY_OVER_SAVE + nextPriority, action: { tableID, type: ACTION.DISCARD, target: chop } };
	}

	if (state.clue_tokens === 0)
		return;

	// Check if TCCM is available
	if (game.level >= LEVEL.TEMPO_CLUES && state.numPlayers > 2 && (!save.playable || state.clue_tokens === 1)) {
		const tccm = Utils.maxOn(stall_clues[1].filter(clue => clue.target === target), clue => {
			const { playables, focus } = clue.result;
			const { tempo, valuable } = valuable_tempo_clue(game, clue, playables, focus);
			const chop = common.chop(state.hands[target]);

			return (tempo && !valuable && clue.result.safe && !state.isPlayable(state.deck[chop])) ? find_clue_value(clue.result) : -1;
		}, 0);

		if (tccm)
			return { urgency: PRIORITY.PLAY_OVER_SAVE + nextPriority, clue: tccm };
	}

	const action = /** @type {const} */ ({ type: 'clue', giver: state.ourPlayerIndex, list, clue: save, target });
	const hypo_game = game.simulate_clue(action);
	const { common: hypo_common, me: hypo_me, state: hypo_state } = hypo_game;

	const all_play_clues = play_clues.flat();

	// Save clue reveals a play
	if (hypo_common.thinksPlayables(hypo_state, target).length > 0)
		all_play_clues.push({ ...save, result: get_result(game, hypo_game, action ) });

	// Try to give a play clue involving them
	const play_over_save = find_play_over_save(game, target, all_play_clues, save);
	if (play_over_save.length > 0)
		return { urgency: PRIORITY.PLAY_OVER_SAVE + nextPriority, clue: Utils.maxOn(play_over_save, (clue) => find_clue_value(clue.result)) };

	const bad_save = hypo_me.thinksLocked(hypo_state, target) ?
		me.chopValue(state, target) < cardValue(state, hypo_me, state.deck[hypo_common.lockedDiscard(hypo_state, hypo_state.hands[target])]) :
		me.chopValue(state, target) < hypo_me.chopValue(hypo_state, target);

	// Do not save at 1 clue if new chop or sacrifice discard are better than old chop
	if (state.clue_tokens === 1 && save.cm.length === 0 && bad_save)
		return;

	const hypo_chop = state.deck[hypo_me.chop(hypo_state.hands[target])];

	const only_save = save.result.interp !== CLUE_INTERP.CM_TRASH &&
		!hypo_me.thinksLocked(hypo_state, target) &&
		(hypo_chop !== undefined && (state.isCritical(hypo_chop) || save2(state, hypo_me, hypo_chop))) &&
		potential_cluers > 0 && state.clue_tokens > 1;

	if (only_save) {
		const urgent = !early_expected_clue && potential_cluers === 1;

		if (urgent)
			logger.info('setting up double save!', logCard(state.deck[hypo_me.chop(hypo_state.hands[target])]));

		return { urgency: PRIORITY.ONLY_SAVE + (urgent ? 0 : prioritySize), clue: save };
	}

	// Do not save if unsafe
	if (!save.safe) {
		logger.info('save clue', logClue(save), 'is unsafe, not giving');
		return;
	}

	// No alternative, have to give save
	return { urgency: PRIORITY.ONLY_SAVE + nextPriority, clue: save };
}
