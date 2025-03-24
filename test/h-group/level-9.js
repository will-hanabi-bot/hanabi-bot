import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COLOUR, PLAYER, VARIANTS, preClue, setup, takeTurn } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';
import { ACTION, CLUE } from '../../src/constants.js';

import logger from '../../src/tools/logger.js';
import { logPerformAction } from '../../src/tools/log.js';
import { find_clues } from '../../src/conventions/h-group/clue-finder/clue-finder.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('stalling', () => {
	it('understands a play clue when there are better clues available', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b1', 'g4', 'b4', 'b2'],
			['y4', 'y4', 'r4', 'r3'],
			['y5', 'r5', 'b5', 'g5']
		], {
			level: { min: 9 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 5 to Donald');
		takeTurn(game, 'Donald clues purple to Alice (slot 4)');

		// Can't be a locked hand stall, because getting b1 is available.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['p1']);
	});

	it('understands a finesse when there are better clues available', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b1', 'g4', 'b4', 'g2'],
			['y4', 'y4', 'r4', 'r3'],
			['y5', 'r5', 'b5', 'g5']
		], {
			level: { min: 9 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 5 to Donald');
		takeTurn(game, 'Donald clues green to Bob');

		// Can't be a locked hand stall, because getting b1 is available.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['g1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].finessed, true);
	});

	it('understands a finesse when there are better clues available 2', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b3', 'g4', 'g2', 'b4'],
			['y4', 'y4', 'r5', 'r4'],
			['r2', 'y2', 'b5', 'g5']
		], {
			level: { min: 9 },
			play_stacks: [2, 0, 0, 0, 2],
			discarded: ['r4'],
		});

		takeTurn(game, 'Alice clues 5 to Donald');
		takeTurn(game, 'Bob clues red to Cathy');	// r4 save
		takeTurn(game, 'Cathy clues 2 to Donald');
		takeTurn(game, 'Donald clues red to Cathy');

		// Can't be a hard burn, because filling in r5 is available.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].finessed, true);
	});

	it('understands a tempo clue when there are better clues available', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'r1', 'g2', 'b4', 'g4'],
			['y4', 'y4', 'r3', 'y2', 'g4']
		], {
			level: { min: 9 },
			play_stacks: [2, 0, 0, 0, 0],
			clue_tokens: 6,
			starting: PLAYER.CATHY,
			init: (game) => {
				game.state.early_game = false;

				// Cathy's slot 3 is clued red.
				preClue(game, game.state.hands[PLAYER.CATHY][2], [{ type: CLUE.COLOUR, value: COLOUR.RED, giver: PLAYER.ALICE }]);
			}
		});

		takeTurn(game, 'Cathy discards g4', 'p4');
		takeTurn(game, 'Alice clues red to Cathy');		// g4 save to bob, y2 save to Cathy, so this can't be a stall

		// Cathy's red card should be known r3, and y2 should be chop moved from TCCM.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]], ['r3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].chop_moved, true);
	});

	it('understands a tempo clue stall', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'r1', 'g2', 'b4', 'g3'],
			['y4', 'y4', 'r3', 'y2', 'g4']
		], {
			level: { min: 9 },
			play_stacks: [2, 0, 0, 0, 0],
			clue_tokens: 6,
			starting: PLAYER.CATHY,
			init: (game) => {
				game.state.early_game = false;

				// Cathy's slot 3 is clued red.
				preClue(game, game.state.hands[PLAYER.CATHY][2], [{ type: CLUE.COLOUR, value: COLOUR.RED, giver: PLAYER.ALICE }]);
			}
		});

		takeTurn(game, 'Cathy discards g4', 'p4');
		takeTurn(game, 'Alice clues 3 to Cathy');		// no play clues or 5 stalls to give, so tempo clue stall

		// Cathy's red card should be known r3, but no TCCM.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]], ['r3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].chop_moved, false);
	});

	it('understands a play clue when not in stalling situation', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b3', 'r2', 'b4', 'g4'],
			['y4', 'y4', 'r4', 'r3'],
			['y5', 'r5', 'b5', 'g5']
		], {
			level: { min: 9 },
			play_stacks: [4, 0, 0, 0, 0],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 5 to Donald');
		takeTurn(game, 'Cathy clues red to Donald');
		takeTurn(game, 'Donald clues green to Alice (slot 4)');

		// Can't be a locked hand stall, because Donald has a play.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['g1']);
	});

	it('correctly finds all clues in stalling situations', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'r4', 'b2', 'b2', 'r1'],
			['y4', 'y4', 'r4', 'r3', 'g2']
		], { level: { min: 9 } });

		takeTurn(game, 'Alice clues 2 to Cathy');
		takeTurn(game, 'Bob clues 5 to Alice (slots 1,2,3,4,5)');
		takeTurn(game, 'Cathy clues red to Bob');

		const { stall_clues } = find_clues(game);

		// 3,4 to Bob are both valid Fill-In Clues
		assert.ok(stall_clues[2].some(clue => clue.target === PLAYER.BOB && clue.type === CLUE.RANK && clue.value === 3));
		assert.ok(stall_clues[2].some(clue => clue.target === PLAYER.BOB && clue.type === CLUE.RANK && clue.value === 4));

		// 3 to Cathy is also a valid Locked Hand Stall.
		assert.ok(stall_clues[3].some(clue => clue.target === PLAYER.CATHY && clue.type === CLUE.RANK && clue.value === 3));

		// However, 2 to Cathy is not a valid Hard Burn (Cathy will play as r2).
		assert.ok(!stall_clues[3].some(clue => clue.target === PLAYER.CATHY && clue.type === CLUE.RANK && clue.value === 2));
	});

	it('gives a bad touch save clue in stalling situations', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r4', 'b3', 'r2', 'p2'],
			['y5', 'y4', 'r4', 'g2', 'r3']
		], {
			level: { min: 9 },
			starting: PLAYER.BOB,
			play_stacks: [2, 2, 2, 0, 0],
			clue_tokens: 4
		});

		takeTurn(game, 'Bob clues 5 to Cathy');			// 5 Stall
		takeTurn(game, 'Cathy discards r3', 'p4');

		// Alice is in DDA, she should clue 2 to Bob even though it bad touches.
		const action = await game.take_action();

		ExAsserts.objHasProperties(action, { type: ACTION.RANK, target: PLAYER.BOB, value: 2 });
	});

	it('gives bad touch play clues over bad touch saves to the same player', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'b1', 'r4', 'r3', 'g1'],
			['y3', 'b3', 'm1', 'm4', 'm3']
		], {
			level: { min: 9 },
			play_stacks: [1, 5, 5, 5, 2],
			clue_tokens: 8,
			variant: VARIANTS.MUDDY_RAINBOW,
		});

		const action = await game.take_action();

		// Alice should give green to Cathy instead of red
		ExAsserts.objHasProperties(action, { type: ACTION.COLOUR, target: PLAYER.CATHY, value: COLOUR.GREEN },
			`Expected (green to Cathy) but got ${logPerformAction(action)}`);
	});

	it('gives a 5 stall on the 5 closest to chop', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r2', 'y4', 'r5', 'g2', 'r3'],
			['y5', 'r4', 'b3', 'b4', 'b1'],
		], {
			level: { min: 9 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues blue to Cathy');
		takeTurn(game, 'Cathy clues 5 to Alice (slot 5)');

		// Alice should 5 Stall on Cathy, since Bob's 5 is farther away from chop.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.RANK, target: PLAYER.CATHY, value: 5 }, `Expected (5 to Cathy), got ${logPerformAction(action)}`);

		// 5 to Bob is not a valid 5 stall.
		const { stall_clues } = find_clues(game);
		assert.ok(!stall_clues[0].some(clue => clue.target === PLAYER.BOB && clue.type === CLUE.RANK && clue.value === 5));
	});

	it('gives a play clue to chop in stalling situations', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r2', 'y4', 'r5', 'g2', 'b1'],
			['y3', 'r4', 'b3', 'b4', 'r3'],
		], {
			level: { min: 9 },
			starting: PLAYER.CATHY,
			clue_tokens: 7
		});

		takeTurn(game, 'Cathy discards r3', 'p4');

		// Alice should clue 1 to Bob.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.RANK, target: PLAYER.BOB, value: 1 }, `Expected (1 to Bob), got ${logPerformAction(action)}`);

		// 5 to Bob is not a valid 5 stall.
		const { stall_clues } = find_clues(game);
		assert.ok(!stall_clues[0].some(clue => clue.target === PLAYER.BOB && clue.type === CLUE.RANK && clue.value === 5));
	});

	it(`doesn't give non-valuable tempo clues to a fully-clued player that is loaded`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b5', 'b2', 'b4', 'b1'],
			['y3', 'r4', 'g3', 'r1', 'r4']
		], {
			level: { min: 9 },
			play_stacks: [1, 0, 0, 0, 0]
		});

		takeTurn(game, 'Alice clues blue to Bob');		// getting b1
		takeTurn(game, 'Bob plays b1', 'r2');
		takeTurn(game, 'Cathy clues 2 to Bob');			// saving r2, revealing b2

		// Alice should discard rather than cluing red to Bob.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD }, `Expected (discard), got ${logPerformAction(action)}`);

		// Red to Bob is not a valid tempo clue.
		const { stall_clues } = find_clues(game);
		assert.ok(!stall_clues[1].some(clue => clue.target === PLAYER.BOB && clue.type === CLUE.COLOUR && clue.value === COLOUR.RED));
	});

	it('gives stalls at pace 0, even if endgame unsolved', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'y4', 'g4', 'b4', 'p5']
		], {
			level: { min: 9 },
			play_stacks: [0, 0, 0, 0, 4],
			clue_tokens: 7,
			init: (game) => {
				// 4 score + 19 cards left + 2 players - 25 max = 0 pace
				game.state.cardsLeft = 19;
				game.state.early_game = false;

				// Bob's p5 is fully known.
				preClue(game, game.state.hands[PLAYER.BOB][4], [
					{ type: CLUE.RANK, value: 5, giver: PLAYER.ALICE },
					{ type: CLUE.COLOUR, value: COLOUR.PURPLE, giver: PLAYER.ALICE }
				]);

				game.common = game.common.update_hypo_stacks(game.state);
			}
		});

		const action = await game.take_action();

		// Alice should hard burn on Bob's p5.
		assert.ok((action.type === ACTION.RANK && action.value === 5) || (action.type === ACTION.COLOUR && action.value === COLOUR.PURPLE),
			`Expected (5 to Bob) or (purple to Bob), got ${logPerformAction(action)}`);
	});
});

describe('anxiety plays', () => {
	it('plays into anxiety', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y5', 'y2', 'b4', 'g4'],
			['b1', 'g4', 'b4', 'b2'],
			['y4', 'y4', 'r4', 'r3']
		], {
			level: { min: 9 },
			play_stacks: [4, 0, 0, 0, 0],
			clue_tokens: 2,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 5 to Alice (slots 2,3,4)');
		takeTurn(game, 'Donald clues 2 to Alice (slot 1)');

		// Alice should play slot 2 as r5.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target:game.state.hands[PLAYER.ALICE][1] }, `Expected (play slot 2), got ${logPerformAction(action)} instead`);
	});

	it(`doesn't assume anxiety if there are clues available`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y5', 'y2', 'b4', 'g4'],
			['b1', 'g4', 'b4', 'b2'],
			['y4', 'y4', 'r4', 'r3']
		], {
			level: { min: 9 },
			play_stacks: [4, 0, 0, 0, 0],
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 5 to Alice (slots 1,2,3,4)');

		// Alice should clue instead of playing/discarding.
		const action = await game.take_action();
		assert.ok(action.type === ACTION.RANK || action.type === ACTION.COLOUR);
	});

	it(`doesn't play into impossible anxiety`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r5', 'y2', 'b4', 'g4'],
			['b1', 'g4', 'b4', 'b2'],
			['y4', 'y4', 'r4', 'r3']
		], {
			level: { min: 9 },
			play_stacks: [4, 0, 0, 0, 0],
			clue_tokens: 1,
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 5 to Alice (slots 1,2,3,4)');

		// Alice should discard, since it isn't possible to play any card.
		const action = await game.take_action();
		assert.ok(action.type === ACTION.DISCARD, `Expected discard, got ${logPerformAction(action)} instead`);
	});

	it('forces the next player into anxiety', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r5', 'y5', 'b5', 'g5'],
			['b1', 'g4', 'b4', 'b2'],
			['y4', 'y4', 'r4', 'r3']
		], {
			level: { min: 9 },
			play_stacks: [3, 0, 0, 0, 0],
			clue_tokens: 2,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 5 to Bob');
		takeTurn(game, 'Donald clues red to Alice (slot 1)');

		// Alice should play slot 1 as r4.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] });
	});

	it('forces the next player into anxiety by playing an unrelated card', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r5', 'y5', 'b5', 'g5'],
			['b3', 'g4', 'b4', 'b2'],
			['y4', 'y4', 'r4', 'r3']
		], {
			level: { min: 9 },
			play_stacks: [4, 0, 0, 0, 0],
			clue_tokens: 2,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 5 to Bob');
		takeTurn(game, 'Donald clues blue to Alice (slot 1)');

		// Alice should play slot 1 as b1.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] });
	});

	/*it('gives an anxiety clue to the next player', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r3', 'y5', 'b5', 'g5'],
			['b1', 'g4', 'b4', 'b1'],
			['y4', 'y4', 'p4', 'p3']
		], {
			level: { min: 9 },
			play_stacks: [2, 0, 0, 0, 0],
			discarded: ['r3', 'r4', 'b3'],
			clue_tokens: 2,
			starting: PLAYER.CATHY,
			init: (game) => {
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Cathy clues 5 to Bob');
		takeTurn(game, 'Donald clues green to Alice (slot 1)');

		// Alice should clue red/3 to Bob as anxiety.
		const action = await game.take_action();
		const { type, target, value } = action;
		assert.ok((type === ACTION.COLOUR && target === PLAYER.BOB && value === COLOUR.RED) ||
			(type === ACTION.RANK && target === PLAYER.BOB && value === 3), `Expected (3/red to Bob), got ${logPerformAction(action)}`);
	});*/
});

describe('double discard avoidance', async () => {
	it(`understands a clue from a player on double discard avoidance may be a stall`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y5', 'g5', 'b4', 'g4'],
			['b1', 'g4', 'b4', 'b2'],
			['y4', 'y4', 'r4', 'r3']
		], {
			level: { min: 9 },
			play_stacks: [2, 2, 2, 2, 2],
			clue_tokens: 6,
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald discards r3', 'p4');

		// A discard of a useful card means Alice is in a DDA situation.
		ExAsserts.objHasProperties(game.state.dda, { suitIndex: COLOUR.RED, rank: 3 });

		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.RANK, target: PLAYER.BOB, value: 5 });

		takeTurn(game, 'Alice clues 5 to Bob');

		// No one should be finessed by this as Alice was simply stalling.
		const finessed = game.state.hands.filter(hand => hand.some(o => game.common.thoughts[o].finessed));
		assert.equal(finessed.length, 0);
		assert.equal(game.common.waiting_connections.length, 0);
	});

	it(`will discard while on double discard avoidance if it can see the card`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r3', 'y5', 'b2', 'g4'],
			['b3', 'b5', 'b4', 'b2'],
			['y4', 'b4', 'r4', 'r3']
		], {
			level: { min: 9 },
			starting: PLAYER.DONALD,
			clue_tokens: 0
		});

		takeTurn(game, 'Donald discards r3', 'p3'); // Ends early game

		// A discard of a useful card means common knowledge is Alice is in a DDA situation.
		ExAsserts.objHasProperties(game.state.dda, { suitIndex: COLOUR.RED, rank: 3 });

		// However, since Alice can see the other r3, Alice can discard.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][3] });
	});

	it(`will give a fill-in clue on double discard avoidance`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r4', 'y4', 'b3', 'g2'],
			['b3', 'g2', 'b4', 'b5'],
			['y4', 'b4', 'r4', 'r3']
		], {
			level: { min: 9 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 5 to Cathy');
		takeTurn(game, 'Cathy clues 2 to Bob');
		takeTurn(game, 'Donald discards r3', 'p3'); // Ends early game

		// A discard of a useful card means common knowledge is Alice is in a DDA situation.
		ExAsserts.objHasProperties(game.state.dda, { suitIndex: COLOUR.RED, rank: 3 });

		// Alice gives a fill-in clue as the highest priority stall clue.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.COLOUR, target: PLAYER.BOB, value: COLOUR.GREEN });
		takeTurn(game, 'Alice clues green to Bob');

		// No one should be finessed by this as Alice was simply stalling.
		const finessed = game.state.hands.filter(hand => hand.some(o => game.common.thoughts[o].finessed));
		assert.equal(finessed.length, 0);
		assert.equal(game.common.waiting_connections.length, 0);
	});

	it(`doesn't treat a sarcastic discard as triggering DDA`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r3', 'y5', 'b2', 'g4'],
			['b3', 'b1', 'g1', 'b3'],
			['b1', 'b4', 'r4', 'r3']
		], {
			level: { min: 9 },
			starting: PLAYER.BOB,
			clue_tokens: 2,
			discarded: ['b1']
		});

		takeTurn(game, 'Bob clues 1 to Cathy');
		takeTurn(game, 'Cathy clues blue to Donald');
		takeTurn(game, 'Donald discards b1', 'p3');

		// The sarcastic discard doesn't trigger dda.
		assert.equal(game.state.dda, undefined);
	});

});
