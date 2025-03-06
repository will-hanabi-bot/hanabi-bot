import { describe, it } from 'node:test';

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
			level: { min: 99 },
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
			level: { min: 99 },
			play_stacks: [3, 4, 4, 4, 4],
      			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Bob (slot 2)');
		takeTurn(game, 'Alice clues 1 to Cathy (slot 5)');

		// Slot 4 should be a 5
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['r5', 'y5', 'g5', 'b5', 'p5']);
	});

	it('plays into trash pushes', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r4', 'y4', 'g4', 'b1'],
			['r1', 'p2', 'b4', 'b1'],
			['r1', 'y2', 'y5', 'y1']
		], {
			level: { min: 99 },
			play_stacks: [3, 3, 4, 4, 4],
      			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Bob (slot 1)');
		takeTurn(game, 'Donald clues yellow to Bob (slot 2)');
		takeTurn(game, 'Alice clues 1 to Donald (slot 4)');

		// Bob should play y4.
		const action = await game.take_action();

		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.BOB][1] }, `Expected (play y4) but got ${logPerformAction(action)}`);
	});
});
