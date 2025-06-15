import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import * as ExAsserts from '../../extra-asserts.js';

import { PLAYER, VARIANTS, setup, takeTurn } from '../../test-utils.js';
import HGroup from '../../../src/conventions/h-group.js';

import logger from '../../../src/tools/logger.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('loaded play clues', () => {
	it('can interpret a delayed play through possible rainbow identities', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g2', 'r1', 'b2', 'y3'],
			['r2', 'y4', 'b3', 'r3'],
			['y4', 'm2', 'r4', 'g1']
		], {
			level: { min: 1 },
			play_stacks: [0, 0, 0, 0, 1],
			variant: VARIANTS.RAINBOW
		});

		takeTurn(game, 'Alice clues 2 to Donald');		// getting m2
		takeTurn(game, 'Bob clues green to Donald');	// getting g1 (with note [g1, m3])
		takeTurn(game, 'Cathy clues green to Bob');		// getting g2

		// Alice's slot 1 should not be finessed for g1.
		const a_slot1 = game.state.hands[PLAYER.ALICE][0];
		assert.equal(game.common.thoughts[a_slot1].status, undefined);
	});

	it.skip(`interprets rainbow correctly when a finesse hasn't been proven yet`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g2', 'r1', 'b2', 'y3'],
			['m1', 'm2', 'b3', 'r3'],
			['y4', 'b1', 'r4', 'm3']
		], {
			level: { min: 11 },
			variant: VARIANTS.RAINBOW
		});

		takeTurn(game, 'Alice clues yellow to Donald');		// getting m3, finessing m1 and m2
		takeTurn(game, 'Bob clues blue to Donald');			// getting b1 (Donald now knows slot 4 is m)
		takeTurn(game, 'Cathy plays m1', 'b4');
		takeTurn(game, 'Donald clues green to Alice (slot 4)');

		// Alice's slot 4 shouldn't be m4.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['g1', 'm3']);
	});
});
