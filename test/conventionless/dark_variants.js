import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { setup, VARIANTS } from '../test-utils.js';
import HGroup from '../../src/conventions/h-group.js';

import logger from '../../src/tools/logger.js';

logger.setLevel(logger.LEVELS.ERROR);

// TODO: Make this actually conventionless and not dependant on the HGroup conventions?

describe('dark variants', () => {
	it('sees dark variants as critical', () => {
		const darkVariants = [
			'Dark Null', 'Dark Brown', 'Cocoa Rainbow',
			'Gray', 'Black', 'Dark Rainbow',
			'Gray Pink', 'Dark Pink', 'Dark Omni',
			'Dark Prism'
		].map(name => Object.values(VARIANTS).find(v => v.name === name)).filter(v => v !== undefined);

		for (const variant of darkVariants) {
			const game = setup(HGroup, [
				['xx', 'xx', 'xx', 'xx', 'xx'],
				['g2', 'b1', 'r2', 'r3', 'g5'],
			], {
				variant
			});

			assert.ok(game.state.isCritical({suitIndex: 4, rank: 1}));
		}
	});
});
