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

	it('plays into trash push finesses', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r4', 'g1', 'g1', 'b1'],
			['r3', 'p3', 'r5', 'b1'],
		], {
			level: { min: 14 },
			play_stacks: [3, 5, 5, 5, 5],
      			starting: PLAYER.Alice
		});

		takeTurn(game, 'Alice clues 1 to Cathy (slot 4)');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['r4']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][2]], ['r5']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].bluffed, true);

		// Bob should play r4.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.BOB][0] }, `Expected (play r4) but got ${logPerformAction(action)}`);
	});
});
