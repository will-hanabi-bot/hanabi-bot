import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { PLAYER, VARIANTS, expandShortCard, setup, takeTurn } from '../../test-utils.js';
import HGroup from '../../../src/conventions/h-group.js';

import logger from '../../../src/tools/logger.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('save clue interpretation', () => {
	it('understands that red is a save', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'b1', 'r2', 'r3', 'g5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.MUDDY_RAINBOW
		});

		takeTurn(game, 'Bob clues red to Alice (slot 5)');

		assert.ok(['m2', 'm5'].every(id =>
			game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].inferred.has(expandShortCard(id))));
	});
	it('understands red saves in cocoa rainbow', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'b1', 'r2', 'r3', 'g5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.COCOA_RAINBOW
		});

		takeTurn(game, 'Bob clues red to Alice (slot 5)');

		assert.ok(['m2', 'm3', 'm4', 'm5'].every(id =>
			game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].inferred.has(expandShortCard(id))));
	});
	it('does not interpret other colors as saves', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'b1', 'r2', 'r3', 'g5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.MUDDY_RAINBOW
		});

		takeTurn(game, 'Bob clues green to Alice (slot 5)');

		assert.ok(['m2', 'm3', 'm4', 'm5'].every(id =>
			!game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].inferred.has(expandShortCard(id))));
	});
});
