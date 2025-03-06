import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { ACTION } from '../../src/constants.js';
import { PLAYER, setup, takeTurn } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';

import logger from '../../src/tools/logger.js';
import { logPerformAction } from '../../src/tools/log.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('trash push', () => {
	it('interprets trash pushes', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'r4', 'r2', 'r5', 'b1']
		], {
			level: { min: 14 },
			play_stacks: [4, 4, 4, 4, 4]
		});

		takeTurn(game, 'Alice clues 1 to Bob (slot 5)');

		// Slot 4 should be a 5
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['r5', 'y5', 'g5', 'b5', 'p5']);
	});

	it('allows trash pushes through clued cards', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'r4', 'p2', 'g4', 'b1'],
			['b2', 'y4', 'y2', 'r5', 'y1']
		], {
			level: { min: 14 },
			play_stacks: [3, 4, 4, 4, 4],
      			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Bob (slot 2)');
		takeTurn(game, 'Alice clues 1 to Cathy (slot 5)');

		// Slot 4 should be playable or delayed playable
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]], ['r4', 'r5', 'y5', 'g5', 'b5', 'p5']);
	});

	it('plays the correct card when some cards are chop moved', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'p1', 'g1', 'b1'],
			['r1', 'p1', 'y1', 'b1'],
		], {
			level: { min: 14 },
			play_stacks: [2, 5, 5, 5, 5],
      			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slot 3)');
		takeTurn(game, 'Cathy clues 2 to Alice (slot 2)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r3']);

		// Alice should play slot 1.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] }, `Expected (play slot 1) but got ${logPerformAction(action)}`);
	});

	it('plays into trash push finesses', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r3', 'p3', 'r5', 'b1'],
			['r1', 'p1', 'y1', 'b1'],
		], {
			level: { min: 14 },
			play_stacks: [3, 5, 5, 5, 5],
      			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 1 to Bob (slot 4)');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r4']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][2]], ['r5']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].bluffed, true);

		// Alice should play r4.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] }, `Expected (play r4) but got ${logPerformAction(action)}`);
	});
});
