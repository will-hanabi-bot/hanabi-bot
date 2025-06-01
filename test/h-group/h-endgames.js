import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import * as ExAsserts from '../../test/extra-asserts.js';

import { COLOUR, PLAYER, preClue, setup } from '../test-utils.js';
import HGroup from '../../src/conventions/h-group.js';

import { ACTION, CLUE } from '../../src/constants.js';
import { solve_game } from '../../src/conventions/shared/endgame.js';
import { find_all_clues } from '../../src/conventions/h-group/take-action.js';

import { Fraction } from '../../src/tools/fraction.js';
import logger from '../../src/tools/logger.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('simple endgames with 1 card left', () => {
	it('solves a basic cluable endgame', () => {
		const game = setup(HGroup, [
			['r5', 'xx', 'xx', 'xx'],
			['y5', 'r1', 'g1', 'b1'],
			['r4', 'r1', 'g1', 'b1'],
			['r4', 'p1', 'p1', 'b5'],
		], {
			play_stacks: [3, 4, 5, 4, 5],
			clue_tokens: 2,
			init: (game) => {
				preClue(game, game.state.hands[PLAYER.ALICE][0], [
					{ giver: PLAYER.DONALD, type: CLUE.RANK, value: 5 },
					{ giver: PLAYER.DONALD, type: CLUE.COLOUR, value: COLOUR.RED }]);

				preClue(game, game.state.hands[PLAYER.DONALD][3], [
					{ giver: PLAYER.ALICE, type: CLUE.RANK, value: 5 },
					{ giver: PLAYER.ALICE, type: CLUE.COLOUR, value: COLOUR.BLUE }]);

				game.state.cardsLeft = 1;
			}
		});

		const { action } = solve_game(game, PLAYER.ALICE, find_all_clues);
		assert.ok(action.type === ACTION.RANK || action.type === ACTION.COLOUR);
	});
});

describe('simple endgames with 1 undrawn identity', () => {
	it('solves a cluable endgame with 1 undrawn identity', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'p4'],
			['p2', 'g3', 'b1', 'b3', 'p3'],
			['y1', 'b1', 'p5', 'r3', 'y3'],
		], {
			play_stacks: [5, 5, 5, 4, 2],
			discarded: ['p3', 'p4'],
			clue_tokens: 5,
			init: (game) => {
				// Alice has known p4 in slot 5.
				preClue(game, game.state.hands[PLAYER.ALICE][4], [
					{ type: CLUE.COLOUR, value: COLOUR.PURPLE, giver: PLAYER.BOB },
					{ type: CLUE.RANK, value: 4, giver: PLAYER.CATHY }]);

				// Bob has known p3 in slot 5.
				preClue(game, game.state.hands[PLAYER.BOB][4], [
					{ type: CLUE.COLOUR, value: COLOUR.PURPLE, giver: PLAYER.ALICE },
					{ type: CLUE.RANK, value: 3, giver: PLAYER.CATHY }]);

				// Cathy has known p5 in slot 3.
				preClue(game, game.state.hands[PLAYER.CATHY][2], [
					{ type: CLUE.COLOUR, value: COLOUR.PURPLE, giver: PLAYER.BOB },
					{ type: CLUE.RANK, value: 5, giver: PLAYER.ALICE }]);

				game.state.cardsLeft = 2;
			}
		});

		const { action } = solve_game(game, PLAYER.ALICE, find_all_clues);
		assert.ok(action.type === ACTION.RANK || action.type === ACTION.COLOUR);
	});

	it('solves a possibly winnable endgame with 1 undrawn identity', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'r3', 'r5'],
			['r1', 'r1', 'y1', 'y1', 'g1'],
			['p1', 'p1', 'b1', 'b1', 'g1'],
			['r2', 'b2', 'g2', 'y2', 'p2']
		], {
			play_stacks: [2, 5, 5, 5, 5],
			discarded: ['r3', 'r4'],
			init: (game) => {
				// Alice has known p4 in slot 4.
				preClue(game, game.state.hands[PLAYER.ALICE][3], [
					{ type: CLUE.COLOUR, value: COLOUR.RED, giver: PLAYER.BOB },
					{ type: CLUE.RANK, value: 3, giver: PLAYER.CATHY }]);

				// Alice has known r5 in slot 5.
				preClue(game, game.state.hands[PLAYER.ALICE][4], [
					{ type: CLUE.COLOUR, value: COLOUR.RED, giver: PLAYER.BOB },
					{ type: CLUE.RANK, value: 5, giver: PLAYER.CATHY }]);

				game.state.cardsLeft = 2;
			}
		});

		// We win as long as r4 isn't bottom decked.
		const { action, winrate } = solve_game(game, PLAYER.ALICE, find_all_clues);
		assert.ok(action.type === ACTION.PLAY);
		assert.ok(winrate.equals(new Fraction(4, 5)), `Winrate was ${winrate.toString}, expected 4/5.`);
	});

	it('solves a more difficult cluable endgame with 1 undrawn identity', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b1', 'r1', 'g1', 'y1', 'r3'],
			['b1', 'r1', 'g1', 'y1', 'r4'],
			['p1', 'p1', 'r2', 'y2', 'y5']
		], {
			play_stacks: [2, 4, 5, 5, 5],
			discarded: ['r3', 'r4'],
			clue_tokens: 1,
			init: (game) => {
				// Bob has known r3 in slot 5.
				preClue(game, game.state.hands[PLAYER.BOB][4], [
					{ type: CLUE.COLOUR, value: COLOUR.RED, giver: PLAYER.ALICE },
					{ type: CLUE.RANK, value: 3, giver: PLAYER.CATHY }]);

				game.state.cardsLeft = 3;
			}
		});

		// Alice should clue 4 to Cathy. (the line is Bob discards, Cathy clues y5, )
		const { action, winrate } = solve_game(game, PLAYER.ALICE, find_all_clues);
		ExAsserts.objHasProperties(action, { type: ACTION.RANK, value: 4, target: PLAYER.CATHY });
		assert.ok(winrate.equals(new Fraction(1, 1)), `Winrate was ${winrate.toString}, expected 1.`);
	});
});
