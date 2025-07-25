import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import * as ExAsserts from '../extra-asserts.js';

import { ACTION, CLUE } from '../../src/constants.js';
import { COLOUR, PLAYER, preClue, setup, takeTurn, VARIANTS } from '../test-utils.js';
import HGroup from '../../src/conventions/h-group.js';
import { CARD_STATUS } from '../../src/basics/Card.js';

import logger from '../../src/tools/logger.js';
import { logPerformAction } from '../../src/tools/log.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('scream discard chop moves', () => {
	it(`performs a basic scream discard`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r2', 'g4', 'b4', 'r5'],
			['g1', 'b3', 'r2', 'y3', 'p3']
		], {
			level: { min: 7 },
			clue_tokens: 1,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Alice (slot 5)');

		const action = await game.take_action();

		// Alice should discard slot 4 as a SDCM.
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][3] });

		// takeTurn(game, 'Alice discards y3 (slot 4)');

		// // Bob's slot 5 should be chop moved.
		// assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][4]].status, CARD_STATUS.CM);
	});

	it(`only scream discards if critical`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r2', 'g4', 'b4', 'y2'],
			['g1', 'b3', 'r2', 'y3', 'p3']
		], {
			level: { min: 7 },
			clue_tokens: 1,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Alice (slot 5)');

		const action = await game.take_action();

		// Alice should play as y2 is not critical or playable.
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][4] });
	});

	it(`scream discards if playable`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r2', 'g4', 'b4', 'y2'],
			['g1', 'b3', 'r2', 'y3', 'p3']
		], {
			level: { min: 7 },
			clue_tokens: 1,
			play_stacks: [0, 1, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Alice (slot 5)');

		const action = await game.take_action();

		// Alice should discard slot 4 to SDCM as y2 is playable.
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][3] });
	});

	it(`doesn't scream discard when target is loaded`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g1', 'r3', 'g4', 'b4', 'r5'],
			['r4', 'b3', 'r2', 'y3', 'p3']
		], {
			level: { min: 7 },
			clue_tokens: 2,
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues red to Alice (slot 5)');
		takeTurn(game, 'Cathy clues green to Bob');

		const action = await game.take_action();

		// Alice should play as Bob is loaded.
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][4] });
	});

	it(`stalls after a scream discard`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r5', 'r2', 'g4', 'b4', 'b3'],
			['g1', 'b3', 'r2', 'y3', 'p3']
		], {
			level: { min: 7 },
			clue_tokens: 1,
			starting: PLAYER.BOB,
			init: (game) => {
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Bob clues green to Cathy');
		takeTurn(game, 'Cathy discards p3', 'p4');

		const action = await game.take_action();

		// Alice should 5 Stall on Bob.
		ExAsserts.objHasProperties(action, { type: ACTION.RANK, target: PLAYER.BOB, value: 5 });
	});

	it(`performs a scream discard at 1 clue when the next player will become locked`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'y5', 'g5', 'b5', 'r5'],
			['g3', 'b3', 'y2', 'y3', 'p3']
		], {
			level: { min: 7 },
			clue_tokens: 3,
			discarded: ['r4'],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues red to Alice (slot 1)');
		takeTurn(game, 'Cathy clues 5 to Bob');

		const action = await game.take_action();

		// Alice should discard slot 5 as a SDCM.
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][4] });

		takeTurn(game, 'Alice discards y3 (slot 5)');

		// Bob's slot 1 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].status, CARD_STATUS.CM);
	});
});

describe('shout discard chop moves', () => {
	it(`performs a shout discard`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r2', 'g4', 'p1', 'g3'],
			['g1', 'b3', 'r2', 'y3', 'p3']
		], {
			level: { min: 7 },
			clue_tokens: 2,
			play_stacks: [1, 1, 1, 1, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 1 to Alice (slots 4,5)');

		const action = await game.take_action();

		// Alice should discard slot 4 as a Shout Discard.
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][3] });

		takeTurn(game, 'Alice discards p1 (slot 4)');

		// Bob's slot 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][4]].status, CARD_STATUS.CM);
	});

	it(`stalls after a shout discard`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r5', 'r4', 'g4', 'b4', 'b3'],
			['p1', 'g1', 'r4', 'y3', 'p3']
		], {
			level: { min: 7 },
			clue_tokens: 1,
			play_stacks: [1, 1, 0, 1, 1],
			starting: PLAYER.BOB,
			init: (game) => {
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Bob clues 1 to Cathy');
		takeTurn(game, 'Cathy discards p1', 'p4');

		const action = await game.take_action();

		// Alice should 5 Stall on Bob.
		ExAsserts.objHasProperties(action, { type: ACTION.RANK, target: PLAYER.BOB, value: 5 });
	});
});

describe('generation discards', () => {
	it(`performs a gen discard`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r2', 'g4', 'b4', 'p2'],
			['g1', 'b3', 'r2', 'y3', 'r5']
		], {
			level: { min: 7 },
			clue_tokens: 1,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Alice (slot 5)');

		const action = await game.take_action();

		// Alice should discard slot 4 to generate for Cathy.
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][3] });
	});

	it(`doesn't mistake a gen discard for a sdcm`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r2', 'g4', 'b4', 'p2'],
			['g1', 'b3', 'r2', 'y3', 'r5']
		], {
			level: { min: 7 },
			clue_tokens: 1,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Alice (slot 5)');

		const action = await game.take_action();

		// Alice should discard slot 4 to generate for Cathy.
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][3] });

		// Bob's slot 5 should not be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][4]].status, undefined);
	});

	it(`interprets generation over sdcm`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r2', 'g4', 'b4', 'r1'],
			['g1', 'b3', 'r2', 'y3', 'p5']
		], {
			level: { min: 7 },
			clue_tokens: 1
		});

		takeTurn(game, 'Alice clues red to Bob');
		takeTurn(game, 'Bob discards b4', 'g3');		// Could be scream or generation

		assert.equal(game.state.discard_state, 'scream');
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].status, CARD_STATUS.CM);

		takeTurn(game, 'Cathy clues 5 to Alice (slot 5)');

		// Alice now knows that it was a generation discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].status, undefined);
	});

	it(`doesn't perform a gen discard if they can connect`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r2', 'g4', 'b4', 'r1'],
			['r3', 'b3', 'r5', 'y3', 'b1']
		], {
			level: { min: 7 },
			clue_tokens: 2,
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Alice (slots 4,5)');
		takeTurn(game, 'Alice plays r2 (slot 5)');
		takeTurn(game, 'Bob clues red to Cathy');
		takeTurn(game, 'Cathy plays r3', 'p4');

		const action = await game.take_action();

		// Alice should play slot 5 (r4 -> r5) rather than generating for Cathy.
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][4] }, `Expected (Play slot 5), got (${logPerformAction(game, action)}).`);
	});

	it(`doesn't perform a gen discard if next player can connect`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r4', 'r2', 'i1', 'g5'],
			['r3', 'b3', 'r5', 'i2'],
			['r3', 'y4', 'b5', 'g4']
		], {
			level: { min: 7 },
			clue_tokens: 1,
			play_stacks: [0, 0, 1, 0, 0],
			variant: VARIANTS.PRISM,
			starting: PLAYER.DONALD,
			init: (game) => {
				// Alice knows about g2 in slot 4.
				preClue(game, game.state.hands[PLAYER.ALICE][3], [{ type: CLUE.COLOUR, value: COLOUR.GREEN, giver: PLAYER.BOB }, { type: CLUE.RANK, value: 2, giver: PLAYER.DONALD }]);

				// Bob knows about i1 in slot 3.
				preClue(game, game.state.hands[PLAYER.BOB][2], [{ type: CLUE.COLOUR, value: COLOUR.RED, giver: PLAYER.ALICE }, { type: CLUE.RANK, value: 1, giver: PLAYER.DONALD }]);
			}
		});

		// Getting y2, but could be y1 (or y2, if Alice finesses).
		takeTurn(game, 'Donald clues yellow to Cathy');

		const action = await game.take_action();

		// Alice should play slot 4 (g2) instead of generating for Cathy. Bob also cannot scream.
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][3] }, `Expected (Play slot 4), got (${logPerformAction(game, action)}).`);
	});
});
