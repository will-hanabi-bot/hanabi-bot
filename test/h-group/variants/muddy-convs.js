import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import * as ExAsserts from '../../extra-asserts.js';
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

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]], ['r1', 'm1', 'm2', 'm5']);
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

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]], ['r1', 'm1', 'm2', 'm3', 'm4', 'm5']);
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
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'b1', 'r2', 'r3', 'g5'],
			['g2', 'b1', 'r2', 'r3', 'y5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.MUDDY_RAINBOW
		});

		takeTurn(game, 'Bob clues red to Alice (slots 2,3,4,5)');
		takeTurn(game, 'Cathy clues green to Alice (slots 3,4,5)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['m1']);
	});

	it('tempos the correct card in cocoa rainbow', () => { // https://hanab.live/shared-replay/1426433#57
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b2', 'm4', 'r1', 'r4', 'y3'],
			['r1', 'g3', 'g2', 'g4', 'm3'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.COCOA_RAINBOW
		});

		takeTurn(game, 'Bob clues red to Alice (slots 4,5)');
		takeTurn(game, 'Cathy clues yellow to Alice (slots 4,5)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]], ['m1']);
	});

	it('recognizes normal tempo clues when the leftmost card is not muddy', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b1', 'r2', 'r3', 'g5'],
			['b1', 'g2', 'g3', 'r5'],
			['b1', 'r2', 'r3', 'y5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.MUDDY_RAINBOW
		});

		takeTurn(game, 'Bob clues red to Alice (slots 3,4)');
		takeTurn(game, 'Cathy clues 2 to Alice (slot 2)');
		takeTurn(game, 'Donald clues green to Alice (slots 2,3,4)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['g2']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['m1', 'm2', 'm3', 'm4', 'm5']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['m1', 'm2', 'm5']);
	});

	it('wraps around', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'b1', 'r2', 'r3', 'g5'],
			['g2', 'b1', 'r2', 'r3', 'y5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.MUDDY_RAINBOW
		});

		takeTurn(game, 'Bob clues yellow to Alice (slots 3,4,5)');
		takeTurn(game, 'Cathy clues red to Alice (slots 3,4)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['m1']);
	});

	it('skips over known non-muddy cards', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b1', 'r2', 'r3', 'g5'],
			['b1', 'g2', 'g3', 'r5'],
			['b1', 'r2', 'r3', 'y5'],
		], {
			level: { min: 1 },
			starting: PLAYER.BOB,
			variant: VARIANTS.MUDDY_RAINBOW
		});

		takeTurn(game, 'Bob clues 5 to Alice (slot 3)');
		takeTurn(game, 'Cathy clues green to Alice (slots 1,2,4)');
		takeTurn(game, 'Donald clues blue to Alice (slots 1,2,3)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['m1']);
	});
});
