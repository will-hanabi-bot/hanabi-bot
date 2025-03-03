// import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { /* COLOUR, */PLAYER, /*VARIANTS, expandShortCard, */setup, takeTurn } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';
// import { ACTION, CLUE } from '../../src/constants.js';
// import { find_clues } from '../../src/conventions/h-group/clue-finder/clue-finder.js';
// import { team_elim } from '../../src/basics/helper.js';

import logger from '../../src/tools/logger.js';
// import { produce } from '../../src/StateProxy.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('3 bluffs', () => {
	it(`writes notes on 3 bluffs correctly`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p1', 'y5', 'r5', 'g5', 'p2'],
			['b3', 'r1', 'g1', 'g2', 'y4']
		], {
			level: { min: 13 },
			starting: PLAYER.ALICE
		});
		takeTurn(game, 'Alice clues blue to Cathy (slot 1)');

		// Cathy's slot 1 could be b1, b2 or b3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]], ['b1', 'b2', 'b3']);

		takeTurn(game, 'Bob plays y1 (slot 1)');

		// After Bob plays into it, Cathy writes b2, b3 
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]], ['b2', 'b3']);
	});
});
