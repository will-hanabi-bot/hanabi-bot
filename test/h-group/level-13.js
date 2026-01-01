import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { PLAYER, preClue, setup, takeTurn, VARIANTS } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';
import { CARD_STATUS } from '../../src/basics/Card.js';

import logger from '../../src/tools/logger.js';
import { CLUE } from '../../src/constants.js';

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

		// A potential bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays y1 (slot 1)');
		// After playing a non-connected card, we know it must be a bluff.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['b2', 'b3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, undefined);
	});

	it(`understands an unknown 3 bluff by rank`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'g2', 'b3'],
			['p4', 'b4', 'r2', 'b1', 'y3'],
		], {
			level: { min: 13 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Bob');

		// A possible bluff is recognized. It can only be a bluff because we don't see the b2.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.BLUFFED);

		takeTurn(game, 'Alice plays y1 (slot 1)');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['r3', 'y3', 'g3', 'b3', 'p3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, undefined);
	});

	it(`understands a known hard self 3 bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'g4', 'b4'],
			['p4', 'b4', 'r2', 'b1', 'y3'],
		], {
			level: { min: 13 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Alice (slot 2)');

		// Assume a bluff over two blind finesse plays.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.BLUFFED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3', 'y3', 'g3', 'b3', 'p3']);

		takeTurn(game, 'Alice plays y1 (slot 1)');

		// Since we assume a bluff, we don't know which 3 it is.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3', 'y3', 'g3', 'b3', 'p3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].status, undefined);
	});

	it(`understands an unknown hard 3 bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'g4', 'b3'],
			['p4', 'b4', 'r2', 'b1', 'y3'],
		], {
			level: { min: 13 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Bob');

		// Assume a bluff over two blind finesse plays.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.BLUFFED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['r3', 'y3', 'g3', 'b3', 'p3']);

		takeTurn(game, 'Alice plays b1 (slot 1)');

		// Since we assume a bluff, we don't know which 3 it is.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['r3', 'y3', 'g3', 'b3', 'p3']);
	});

	it(`connects a finesse when a bluff is impossible`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r2', 'b3', 'b4', 'p3', 'p4'],
			['b5', 'r3', 'r4', 'g3', 'b1'],
		], {
			level: { min: 13 },
			play_stacks: [1, 0, 0, 0, 0],
			init: (game) => {
				// Cathy's slot 2 is clued with 3.
				preClue(game, game.state.hands[PLAYER.CATHY][1], [{ type: CLUE.RANK, value: 3, giver: PLAYER.BOB }]);
			}
		});

		takeTurn(game, 'Alice clues 4 to Cathy');
		takeTurn(game, 'Bob plays r2', 'r5');

		// Since r4 is not a valid bluff target, Cathy is promised r3 prompt.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r3']);

		// Cathy should write [r4] on slot 3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][2]], ['r4']);
	});

	it(`understands a hard bluff on others`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r2', 'b3', 'b4', 'p3', 'p4'],
			['b5', 'r3', 'r4', 'g3', 'b1'],
		], {
			level: { min: 13 },
			play_stacks: [1, 0, 0, 2, 0],
			init: (game) => {
				// Cathy's slot 2 is clued with 3.
				preClue(game, game.state.hands[PLAYER.CATHY][1], [{ type: CLUE.RANK, value: 3, giver: PLAYER.BOB }]);
			}
		});

		takeTurn(game, 'Alice clues 4 to Cathy');
		takeTurn(game, 'Bob plays r2', 'r5');

		// Since b4 would be a valid bluff target, Cathy is not promised anything about the 3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r3', 'y3', 'g3', 'b3', 'p3']);

		// Cathy should write [r4,b4] on slot 3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][2]], ['r4', 'b4']);
	});

	it(`understands a hard bluff on us`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b5', 'b3', 'b4', 'p3', 'p4'],
			['r2', 'y3', 'y4', 'g3', 'g4'],
		], {
			level: { min: 13 },
			play_stacks: [1, 0, 0, 2, 0],
			starting: PLAYER.BOB,
			init: (game) => {
				// Alice's slot 2 is clued with 3.
				preClue(game, game.state.hands[PLAYER.ALICE][1], [{ type: CLUE.RANK, value: 3, giver: PLAYER.BOB }]);
			}
		});

		takeTurn(game, 'Bob clues 4 to Alice (slot 3)');
		takeTurn(game, 'Cathy plays r2', 'r5');

		// Since b4 is a valid bluff target, Alice is not promised anything about the 3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3', 'y3', 'g3', 'b3', 'p3']);

		// Alice can have r4 (if slot 2 is r3) or b4 in slot 3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r4', 'b4']);
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

		// After playing a connecting card, we know it must be a bluff.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['b2', 'b3', 'b4']);
	});

	it(`understands a critical colour finesse when already clued`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y2', 'b4', 'r3', 'p4'],
			['b3', 'g4', 'p2', 'y4'],
			['p5', 'b1', 'b1', 'y3'],
		], {
			level: { min: 13 },
			discarded: ['b4', 'p4'],
			starting: PLAYER.CATHY
		});

		// Critical save.
		takeTurn(game, 'Cathy clues 4 to Bob');

		takeTurn(game, 'Donald clues blue to Bob');
		// Since the critical card was not newly touched, this must be a finesse.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['b1']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['b2']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]], ['b3']);
	});

	it(`understands an unknown critical colour bluff (black suit)`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'k4', 'g3'],
			['b4', 'b1', 'b3', 'b1', 'y3'],
		], {
			level: { min: 13 },
			starting: PLAYER.CATHY,
			variant: VARIANTS.BLACK
		});

		takeTurn(game, 'Cathy clues black to Bob');

		// A possible bluff is recognized.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1', 'y1', 'g1', 'b1', 'k1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays y1 (slot 1)');

		// After playing a non-connecting card, we know it must be a bluff.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['k2', 'k3', 'k4']);
	});

	it(`understands a critical rank finesse`, () => {
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

		// A critical bluff cannot be given by rank. This must be a finesse.
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

	it(`still understands a 3 finesse by colour when the play connects`, () => {
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

		// After playing a connecting card, we know it must be a finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['b2']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['b3']);
	});

	it(`still understands a 3 finesse by rank when the play connects`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'y2', 'g2', 'g2', 'r3'],
			['p4', 'b1', 'y1', 'b4', 'y3'],
		], {
			level: { min: 13 },
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Bob');

		// A possible bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays r2 (slot 1)');

		// After playing a connecting card, a finesse is assumed.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['r3']);
	});

	it(`understands a 3 bluff when the play doesn't connect`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'y2', 'g2', 'g2', 'r3'],
			['p4', 'b1', 'y1', 'b4', 'y3'],
		], {
			level: { min: 13 },
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Bob');

		// A possible bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays g1 (slot 1)');

		// After playing a non-connecting card, we know it is a bluff.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][4]], ['r3', 'y3', 'g3', 'b3', 'p3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, undefined);
	});

	it(`still understands a self 3 finesse when the play connects`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'y2', 'g2', 'g2', 'b3'],
			['p4', 'b1', 'y1', 'b4', 'y3'],
		], {
			level: { min: 13 },
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Alice (slot 2)');

		// A possible bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays r2 (slot 1)');

		// After playing a connecting card, a finesse is assumed.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3']);
	});

	it(`understands a self 3 bluff when the possible finesse doesn't connect`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'y2', 'g2', 'g2', 'b3'],
			['p4', 'b1', 'y1', 'b4', 'y3'],
		], {
			level: { min: 13 },
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Alice (slot 2)');

		// A possible bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays y1 (slot 1)');

		// After playing a non-connecting card, a bluff is assumed.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3', 'y3', 'g3', 'b3', 'p3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].status, undefined);
	});

	it(`still understands a clandestine 3 finesse when the play connects`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'g4', 'g2', 'g2', 'y3'],
			['p4', 'b1', 'y1', 'b4', 'y3'],
		], {
			level: { min: 13 },
			play_stacks: [1, 1, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Bob');

		// A possible bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		takeTurn(game, 'Alice plays r2 (slot 1)');

		// Since r2 connects to a 3, Alice should assume a clandestine finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['y2']);
	});

	it(`still understands a clandestine 3 finesse when the play connects (2 away)`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'g4', 'g2', 'g2', 'y3'],
			['p4', 'b1', 'y1', 'b4', 'y3'],
		], {
			level: { min: 13 },
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Bob');

		// A possible bluff is recognized.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.BLUFFED);

		takeTurn(game, 'Alice plays r2 (slot 1)');

		// Since r2 connects to a 3, Alice should assume a clandestine finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['y1']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['y2']);
	});

	it(`still understands receiving a clandestine 3 finesse when the play connects`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p3', 'p4', 'g2', 'g2', 'p4'],
			['r2', 'y1', 'y2', 'g4', 'b4'],
		], {
			level: { min: 13 },
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 3 to Alice (slot 2)');
		takeTurn(game, 'Cathy plays r2', 'r5');

		// Since r2 connects to a 3, Alice may have r3, but since y1 and y2 are also possible,
		// Alice needs to wait to see if y1 plays.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3', 'y3']);
	});

});
