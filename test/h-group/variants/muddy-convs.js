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
			variant: VARIANTS.COCOA_RAINBOW
		});

		takeTurn(game, 'Bob clues green to Alice (slot 5)');

		assert.ok(['m2', 'm3', 'm4', 'm5'].every(id =>
			!game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].inferred.has(expandShortCard(id))));
	});
});
describe('muddy tempo clues', () => {
	it('interprets mud clues correctly', () => {
		const game = setup(HGroup, [
			['y1', 'r5', 'm3', 'm1', 'm5'],
			['g2', 'b1', 'r2', 'r3', 'g5'],
			['g2', 'b1', 'r2', 'r3', 'y5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.MUDDY_RAINBOW
		});

		takeTurn(game, 'Bob clues red to Alice (slots 2,3,4,5)');
		takeTurn(game, 'Cathy clues green to Alice (slots 3,4,5)');

		assert.ok(['m1'].every(id =>
			game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].inferred.has(expandShortCard(id))));
		assert.ok(['m2', 'm5'].every(id =>
			!game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].inferred.has(expandShortCard(id))));
	});
	it('wraps around', () => {
		const game = setup(HGroup, [
			['g1', 'g1', 'g1', 'm1', 'm5'],
			['g2', 'b1', 'r2', 'r3', 'g5'],
			['g2', 'b1', 'r2', 'r3', 'y5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.MUDDY_RAINBOW
		});

		takeTurn(game, 'Bob clues red to Alice (slots 4,5)');
		takeTurn(game, 'Cathy clues yellow to Alice (slots 4,5)');

		assert.ok(['m1'].every(id =>
			game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].inferred.has(expandShortCard(id))));
		assert.ok(['m2', 'm3', 'm4', 'm5'].every(id =>
			!game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].inferred.has(expandShortCard(id))));
	});
	it('skips over known non-muddy cards', () => {
		const game = setup(HGroup, [
			['m3', 'm1', 'b5', 'g1'],
			['b1', 'r2', 'r3', 'g5'],
			['b1', 'r2', 'r3', 'y5'],
			['b1', 'r2', 'r3', 'y5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.MUDDY_RAINBOW
		});

		takeTurn(game, 'Bob clues 5 to Alice (slot 3)');
		takeTurn(game, 'Cathy clues green to Alice (slots 1,2,4)');
		takeTurn(game, 'Donald clues blue to Alice (slots 1,2,3)');
		

		assert.ok(['m1'].every(id =>
			game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].inferred.has(expandShortCard(id))));
	});
});
