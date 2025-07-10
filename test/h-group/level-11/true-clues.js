import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COLOUR, PLAYER, VARIANTS, preClue, setup, takeTurn } from '../../test-utils.js';
import * as ExAsserts from '../../extra-asserts.js';
import HGroup from '../../../src/conventions/h-group.js';
import { CLUE } from '../../../src/constants.js';
import { CARD_STATUS } from '../../../src/basics/Card.js';

import logger from '../../../src/tools/logger.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('true clues', () => {
	it(`understands a direct play if the bluff isn't played into`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p1', 'y5', 'b1', 'g5', 'p2'],
			['b3', 'r1', 'b5', 'b2', 'y4']
		], {
			level: { min: 11 },
			play_stacks: [2, 2, 2, 2, 2],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues red to Alice (slot 2)');

		// Cathy's slot 1 could be any of the playable 3's.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]], ['r3', 'y3', 'g3', 'b3', 'p3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);

		// Alice's slot 2 could be r3 or r4.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3', 'r4']);

		takeTurn(game, 'Cathy discards y4', 'y1');

		// After Cathy doesn't play into it, assume we have a play. 
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3']);
	});

	it(`understands a finesse if the played card matches`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g5', 'y2', 'b3', 'y5'],
			['p1', 'r3', 'g1', 'y4'],
			['p2', 'b5', 'b1', 'y1']
		], {
			level: { min: 11 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues purple to Alice (slot 1)');
		takeTurn(game, 'Cathy plays p1', 'r2');
		takeTurn(game, 'Donald plays p2', 'b4');

		// Alice's slot 1 must be the p3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['p3']);
	});

	it(`understands a self finesse that's too long to be a bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g5', 'y2', 'b3', 'y5'],
			['p4', 'r3', 'g1', 'y4'],
			['p2', 'b5', 'b1', 'y1']
		], {
			level: { min: 11 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 4 to Alice (slot 2)');

		// Alice's slot 1 could be any of the next 1's.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1', 'y1', 'g1', 'b1', 'p1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
	});

	it('understands giving a direct play through a bluff opportunity', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'r1', 'b1', 'g5', 'p2'],
			['p1', 'r3', 'b5', 'b2', 'y4']
		], {
			level: { min: 11 },
			play_stacks: [2, 2, 2, 2, 2]
		});

		takeTurn(game, 'Alice clues red to Cathy');

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].status, undefined);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r3', 'r4']);

		takeTurn(game, 'Bob discards p2', 'y5');

		// After Bob doesn't play into the bluff, Cathy knows it is an r3 
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r3']);
	});

	it(`recognizes a finesse when target is not a valid bluff target`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b3', 'y3', 'g1', 'y1'],
			['r2', 'b1', 'p5', 'p1'],
			['p2', 'r1', 'b2', 'y1']
		], {
			level: { min: 11 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 2 to Donald');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['p1']);
	});

	it('never assumes a bluff when reverse finesse exists', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'r1', 'y1', 'g5', 'g2'],
			['b3', 'w1', 'w1', 'w5', 'w2'],
			['r1', 'r4', 'b5', 'b2', 'y4']
		], {
			level: { min: 11 },
			play_stacks: [2, 2, 2, 2, 2],
			starting: PLAYER.DONALD,
			variant: VARIANTS.WHITE
		});

		takeTurn(game, 'Donald clues blue to Bob');

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, undefined);

		// Bob's card could be b3 or b4 depending on whether Cathy plays.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['b3', 'b4']);
		// Cathy's slot 1 must be b3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]], ['b3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.FINESSED);
	});

	it('assumes a finesse over self bluff when connecting cards exist', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g4', 'g2', 'p1', 'b2'],
			['b4', 'g4', 'y4', 'r4'],
			['y3', 'r1', 'g3', 'p3']
		], {
			level: { min: 11 },
			play_stacks: [0, 1, 0, 0, 1],
			starting: PLAYER.CATHY
		});
		takeTurn(game, 'Cathy clues red to Donald');
		takeTurn(game, 'Donald clues 3 to Alice (slot 1)');

		// The bluff is not allowed as it can't be resolved immediately.
		// Alice must have a playable 3 with a connection to it in the second position.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r3', 'y3', 'p3']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r2', 'y2', 'p2']);
	});

	it(`understands a double finesse if the target is too far away to be a bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g4', 'p3', 'r3', 'b4'],
			['y1', 'y2', 'p2', 'p4'],
			['b1', 'y5', 'g2', 'r4']
		], {
			level: { min: 11 },
			starting: PLAYER.DONALD,
			play_stacks: [3, 4, 1, 1, 3],
			discarded: ['r1', 'y3', 'g3']
		});

		takeTurn(game, 'Donald clues blue to Bob');

		// We expect Alice is finessed on both slots
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['b2']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['b3']);
	});

	it(`understands a double reverse finesse if the target is too far away to be a bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g3', 'p4', 'r2', 'y1'],
			['g4', 'p1', 'b4', 'p3'],
			['b4', 'y2', 'g5', 'y3']
		], {
			level: { min: 11 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Donald');

		// Alice should be finessed for y1.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['y1']);
	});

	it(`understands a layered finesse if the target is too far away to be a bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y4', 'p4', 'r2', 'y1'],
			['g5', 'b1', 'b4', 'y3'],
			['g4', 'p1', 'g3', 'p3']
		], {
			level: { min: 11 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 3 to Cathy');

		// Alice should be finessed for y1.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['y1']);

		takeTurn(game, 'Alice plays r1 (slot 1)');

		// Alice should write a layered finesse.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['y1']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['y2']);
	});

	it(`understands a clandestine finesse`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y4', 'y5', 'y1', 'y1'],
			['g3', 'g3', 'b2', 'b1'],
			['g1', 'r1', 'r3', 'y2']
		], {
			level: { min: 11 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Alice (slot 4)');

		// Alice's slot 4 should be r3 as a Clandestine Finesse (no 3 is a valid bluff target).
		// Note, it's not common knowledge that both g3's are visible in Cathy's hand.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['r3', 'g3']);
		ExAsserts.cardHasInferences(game.players[PLAYER.ALICE].thoughts[game.state.hands[PLAYER.ALICE][3]], ['r3']);
	});

	it('rank connects on a self-finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b4', 'p1', 'y1', 'p4'],
			['r3', 'p3', 'p1', 'y2'],
			['b3', 'y2', 'g4', 'r5']
		], {
			level: { min: 11 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 2 to Alice (slot 3)');
		takeTurn(game, 'Alice plays g1 (slot 1)');

		// Slot 3 should be g2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['g2']);
	});

	it('does not allow a second round when a bluff is not played into', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g1', 'g3', 'p4', 'p3'],
			['r5', 'y5', 'g4', 'r1'],
			['r3', 'g1', 'p2', 'r3']
		], {
			level: { min: 11 },
			play_stacks: [2, 0, 0, 0, 0],
			starting: PLAYER.CATHY,
			init: (game) => {
				// Donald has known p2 in slot 3.
				preClue(game, game.state.hands[PLAYER.DONALD][2], [
					{ type: CLUE.COLOUR, value: COLOUR.PURPLE, giver: PLAYER.ALICE },
					{ type: CLUE.RANK, value: 2, giver: PLAYER.BOB }]);
			}
		});

		takeTurn(game, 'Cathy clues purple to Bob');		// Could be bluff on Donald or finesse on us
		takeTurn(game, 'Donald discards r3 (slot 4)', 'r4');

		// Slot 1 should be finessed as p1.
		const slot1 = game.common.thoughts[game.state.hands[PLAYER.ALICE][0]];
		assert.equal(slot1.status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(slot1, ['p1']);
	});
});
