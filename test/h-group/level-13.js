import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { PLAYER, setup, takeTurn } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';
import { CARD_STATUS } from '../../src/basics/Card.js';

import logger from '../../src/tools/logger.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('intermediate bluff clues', () => {
	it(`understands a known 3 bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'g2', 'b3'],
			['p4', 'b1', 'b1', 'b1', 'y3'],
		], {
			level: { min: 13 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues blue to Bob');

		// Despite knowing that it can't be b1, the bluff is still recognized.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1', 'y1', 'g1', 'b1', 'p1']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['b1', 'b2', 'b3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.BLUFFED);

		// Alice knows it can't be b1.
		ExAsserts.cardHasInferences(game.players[PLAYER.ALICE].thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1', 'y1', 'g1', 'p1']);

		// Everyone knows Bob has it narrowed down to b2 or b3 after the play.
		takeTurn(game, 'Alice plays y1 (slot 1)');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['b2', 'b3']);
	});

	it(`understands an unknown 3 bluff by colour`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'g2', 'b3'],
			['p4', 'b4', 'r2', 'b1', 'y3'],
		], {
			level: { min: 13 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues blue to Bob');

		// A possible bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays y1 (slot 1)');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['b2', 'b3']);
	});

	it(`understands an unknown 3 bluff by number`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'g2', 'b3'],
			['p4', 'b4', 'r2', 'b1', 'y3'],
		], {
			level: { min: 13 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Bob');

		// A possible bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays y1 (slot 1)');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['r3', 'y3', 'g3', 'b3', 'p3']);
	});

	it('understands giving a 3 bluff', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b1', 'r1', 'b4', 'g5', 'p2'],
			['p1', 'r3', 'b5', 'b2', 'y4']
		], {
			level: { min: 13 },
		});
		takeTurn(game, 'Alice clues red to Cathy');

		// Bob's slot 1 could be any of the playable 1's.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].status, CARD_STATUS.BLUFFED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['r1', 'y1', 'g1', 'b1', 'p1']);

		// Cathy's slot 2 could be r1, r2 or r3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r1', 'r2', 'r3']);

		takeTurn(game, 'Bob plays b1', 'y5');

		// After Bob plays into the bluff, Cathy knows it was a bluffed r2 or r3
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r2', 'r3']);
	});

	it(`understands an unknown critical colour bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'b4', 'g3'],
			['p4', 'b1', 'b3', 'b1', 'y3'],
		], {
			level: { min: 13 },
			discarded: ['b4'],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues blue to Bob');

		// A possible bluff is recognized.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1', 'y1', 'g1', 'b1', 'p1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays y1 (slot 1)');

		// After playing a connecting card, it knows it must be a bluff.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['b2', 'b3', 'b4']);
	});

	it(`understands a critical number finesse`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'b4', 'g3'],
			['p4', 'b1', 'b3', 'b1', 'y3'],
		], {
			level: { min: 13 },
			discarded: ['b4'],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 4 to Bob');

		// A critical bluff cannot be given by colour. This must be a finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['b1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
	});

	it('understands giving a critical colour bluff', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b1', 'r1', 'b4', 'g5', 'p2'],
			['p1', 'r4', 'b5', 'b2', 'y4']
		], {
			level: { min: 13 },
			discarded: ['r4'],
		});
		takeTurn(game, 'Alice clues red to Cathy');

		// Bob's slot 1 could be any of the playable 1's.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].status, CARD_STATUS.BLUFFED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['r1', 'y1', 'g1', 'b1', 'p1']);

		// Cathy's slot 2 could be r1, r2, r3 or r4.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r1', 'r2', 'r3', 'r4']);

		takeTurn(game, 'Bob plays b1', 'y5');

		// After Bob plays into the bluff, Cathy knows it was a bluffed r2, r3 or r4
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r2', 'r3', 'r4']);
	});

	it(`still understands a 3 finesse when the play connects`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'g2', 'b3'],
			['p4', 'b1', 'b1', 'b4', 'y3'],
		], {
			level: { min: 13 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues blue to Bob');

		// A possible bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays b1 (slot 1)');

		// After playing a connecting card, it knows it must be a finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['b2']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['b3']);
	});

});
