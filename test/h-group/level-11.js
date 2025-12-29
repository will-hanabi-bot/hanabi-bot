import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COLOUR, PLAYER, VARIANTS, preClue, setup, takeTurn } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';
import { ACTION, CLUE } from '../../src/constants.js';
import { CARD_STATUS } from '../../src/basics/Card.js';

import logger from '../../src/tools/logger.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('bluff clues', () => {
	it(`understands a known bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'g2', 'b2'],
			['p4', 'b1', 'b1', 'b1', 'y3'],
		], {
			level: { min: 11 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues blue to Bob');

		// Despite knowing that it can't be b1, the bluff is still recognized.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1', 'y1', 'g1', 'b1', 'p1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.BLUFFED);

		// Alice knows it can't be b1.
		ExAsserts.cardHasInferences(game.players[PLAYER.ALICE].thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1', 'y1', 'g1', 'p1']);
	});

	it(`plays into an uncertain finesse by layered gd`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r4', 'p4', 'g2', 'p5'],
			['r2', 'g4', 'b4', 'b4', 'y3'],
			['g1', 'r2', 'y4', 'y4', 'g4']
		], {
			level: { min: 11 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues red to Cathy');		// finessing r1
		takeTurn(game, 'Alice clues 5 to Bob');
		takeTurn(game, 'Bob plays r1', 'p4');
		takeTurn(game, 'Cathy discards r2', 'y5');			// layered gd on Donald

		takeTurn(game, 'Donald clues green to Bob');		// f, maybe bluff on us

		// We can't certain discard because it could be a bluff.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['g1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);

		const action = await game.take_action();

		// We should play slot 1.
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] });
	});

	it(`understands a bluff with a rank clue disconnect (pink suit)`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y2', 'g2', 'g2', 'b2'],
			['i1', 'b4', 'r4', 'g3', 'y3'],
		], {
			level: {
				min: 11,
				max: 12, /* At level 13 a 3 bluff makes any suit possible */
			},
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues 3 to Alice (slot 3)');

		ExAsserts.cardHasInferences(game.players[PLAYER.ALICE].thoughts[game.state.hands[PLAYER.ALICE][2]], ['r3']);

		takeTurn(game, 'Cathy plays i1', 'b5');

		// After the play, Alice still assumes a bluff since the rank does not connect to the play.
		ExAsserts.cardHasInferences(game.players[PLAYER.ALICE].thoughts[game.state.hands[PLAYER.ALICE][2]], ['r3']);
	});

	it('understands giving a bluff', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'r1', 'b1', 'g5', 'p2'],
			['p1', 'r4', 'b5', 'b2', 'y4']
		], {
			level: { min: 11 },
			play_stacks: [2, 2, 2, 2, 2]
		});
		takeTurn(game, 'Alice clues red to Cathy');

		// Bob's slot 1 could be any of the playable 3's.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].status, CARD_STATUS.BLUFFED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['r3', 'y3', 'g3', 'b3', 'p3']);

		// Cathy's slot 2 could be r3 or r4.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r3', 'r4']);

		takeTurn(game, 'Bob plays b3', 'y5');

		// After Bob plays into the bluff, Cathy knows it is an r4 
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r4']);
	});

	it('understands a bluff even if bluffed card could duplicate cards in hand', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g3', 'r2', 'b4', 'b2'],
			['y1', 'r4', 'p4', 'r4'],
			['b2', 'g1', 'p3', 'r3'],
		], {
			level: { min: 11 },
			play_stacks: [1, 0, 0, 0, 0]
		});

		takeTurn(game, 'Alice clues 2 to Bob');
		takeTurn(game, 'Bob clues red to Donald');

		// Cathy's slot 1 could be any playable.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]], ['r2', 'y1', 'g1', 'b1', 'p1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, undefined);

		// Donald's slot 4 must be r2,g3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.DONALD][3]], ['r2', 'r3']);

		takeTurn(game, 'Cathy plays y1', 'p5');

		// After Cathy plays into the bluff, Donald knows it is r3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.DONALD][3]], ['r3']);

		// And no-one is finessed.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, undefined);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].status, undefined);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, undefined);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.DONALD][0]].status, undefined);
	});

	it('understands receiving a bluff', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'r1', 'y1', 'g5', 'p2'],
			['p1', 'r4', 'b5', 'b2', 'y4']
		], {
			level: { min: 11 },
			play_stacks: [2, 2, 2, 2, 2],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues blue to Bob');

		// Alice's slot 1 is assumed b3 (Bob's Truth Principle)
		const alice_slot1 = game.common.thoughts[game.state.hands[PLAYER.ALICE][0]];
		ExAsserts.cardHasInferences(alice_slot1, ['b3']);
		assert.equal(alice_slot1.status, CARD_STATUS.F_MAYBE_BLUFF);

		// Bob's slot 1 is symmetrically [b3,b4].
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['b3', 'b4']);

		takeTurn(game, 'Alice plays b3 (slot 1)', 'y5');

		// After Alice plays into the bluff, Bob knows it is a b4 
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['b4']);
	});

	it('infers the identity of indirect bluffs', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'r1', 'y1', 'g5', 'g3'],
			['p1', 'r4', 'b5', 'b2', 'y3'],
		], {
			level: {
				min: 11,
				max: 12, /* At level 13 a 3 bluff makes r3 possible */
			},
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues red to Alice (slot 4)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], game.level >= 13 ? ['r1', 'r2', 'r3'] : ['r1', 'r2']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);

		takeTurn(game, 'Cathy plays p1', 'p2');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['r2']);

		takeTurn(game, 'Alice discards g4 (slot 5)');
		takeTurn(game, 'Bob clues red to Alice (slots 1,5)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1', 'r3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);

		takeTurn(game, 'Cathy plays p2', 'p3');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r3']);
	});

	it('infers the identity of bluffed prompts', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b4', 'r1', 'y1', 'g5'],
			['p1', 'r4', 'b5', 'b2'],
			['g4', 'r4', 'r5', 'g3']
		], {
			level: { min: 11 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues red to Alice (slots 3,4)');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['r1']);
		takeTurn(game, 'Alice plays r1 (slot 4)');

		// The only way this clue makes sense is if we have r3 to connect to the r4, r5 in Donald's hand.
		takeTurn(game, 'Bob clues red to Donald');
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['r3']);

		takeTurn(game, 'Cathy plays p1', 'g1');

		// Alice's slot 4 should still be r3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['r3']);
	});

	it('infers the identity of bluff prompts through other people', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b4', 'r1', 'y1', 'g5'],
			['p1', 'r4', 'b5', 'b2'],
			['g4', 'b2', 'r3', 'r1']
		], {
			level: { min: 11 },
			clue_tokens: 7,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Donald');
		takeTurn(game, 'Donald plays r1', 'p5');
		takeTurn(game, 'Alice discards y4 (slot 4)');

		takeTurn(game, 'Bob clues red to Alice (slots 2,3)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r2', 'r4']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);

		takeTurn(game, 'Cathy plays p1', 'p2');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r4']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.DONALD][3]], ['r3']);
	});

	it('connects on clued cards not in prompt position', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b4', 'r1', 'y1', 'g5'],
			['p1', 'r4', 'b5', 'b2'],
			['g4', 'r5', 'r3', 'r1']
		], {
			level: { min: 11 },
			clue_tokens: 7,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Donald');
		takeTurn(game, 'Donald plays r1', 'p5');
		takeTurn(game, 'Alice discards y4 (slot 4)');

		takeTurn(game, 'Bob clues red to Alice (slots 2,3)');
		takeTurn(game, 'Cathy plays p1', 'p2');

		// Same scenario as above, but r3 is no longer in prompt position.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r4']);
	});

	it(`doesn't connect if unnecessary`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r3', 'r1', 'y1', 'r4'],
			['b4', 'r4', 'b1', 'b3'],
			['g1', 'r5', 'r3', 'r1']
		], {
			level: {
				min: 11,
				max: 12, /* At level 13 a 3 bluff makes any 3 possible */
			},
			play_stacks: [1, 1, 0, 0, 2],
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 3 to Bob');
		takeTurn(game, 'Alice plays b1 (slot 1)');		// bluffed b1

		// Bob's slot 1 should be [r3,y3].
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['r3', 'y3']);

		takeTurn(game, 'Bob clues 5 to Donald');
		takeTurn(game, 'Cathy clues 4 to Bob');			// bluffing g1

		// Bob's slot 1 should still be [r3,y3], since p4 would be a direct bluff.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['r3', 'y3']);

		takeTurn(game, 'Donald plays g1', 'y3');

		// Bob's slot 1 should still be [r3,y3].
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['r3', 'y3']);
	});

	it(`makes the correct inferences on a received bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'], // y4 y2 y4 b5
			['p2', 'y2', 'g3', 'b1'],
			['r4', 'b1', 'g5', 'r2'],
			['p2', 'r4', 'r1', 'b3']
		], {
			level: { min: 11 },
			play_stacks: [1, 1, 0, 0, 1],
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 1 to Bob');
		takeTurn(game, 'Alice clues yellow to Bob');
		takeTurn(game, 'Bob clues red to Cathy');
		takeTurn(game, 'Cathy clues 2 to Alice (slot 2)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['g2', 'b2', 'p2']);

		takeTurn(game, 'Donald plays p2', 'b2');

		// After the play, we should narrow it down to only the bluff possibility.
		// If it were the finesse through b1, Donald wouldn't have played.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['g2']);
	});

	it('understands being clued a bluff with a rank disconnect', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'r1', 'y1', 'g5', 'p2'],
			['p1', 'r4', 'b5', 'b2', 'y4']
		], {
			level: {
				min: 11,
				max: 12, /* At level 13 a 3 bluff makes any suit possible */
			},
			play_stacks: [1, 2, 1, 0, 0],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 3 to Alice (slot 2)');

		// Alice's slot 2 could be any of the playable 3's
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3', 'y3', 'g3']);

		// Cathy plays to demonstrate the bluff.
		takeTurn(game, 'Cathy plays p1', 'y5');

		// After Cathy plays, Alice should know it was a bluff.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3', 'g3']);
	});

	it('prioritizes playing into a bluff', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p3', 'r4', 'p1', 'b2', 'y4'],
			['y2', 'y3', 'y5', 'p1', 'g4']
		], {
			level: { min: 11 },
			play_stacks: [0, 1, 0, 0, 1],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues yellow to Cathy');
		takeTurn(game, 'Cathy clues blue to Bob');

		// Alice's slot 1 is assumed b1 (Bob's Truth Principle).
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.F_MAYBE_BLUFF);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['b1']);

		// Bob's slot 4 is symmetrically [b1,b2].
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['b1', 'b2']);

		const action = await game.take_action();

		// Alice should play to prevent a misplay of the b2 instead of saving y4.
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] });
	});

	it(`understands a bluff on top of known queued plays`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r2', 'y1', 'y1', 'r4'],
			['p5', 'b2', 'r3', 'y5', 'y4'],
			['g1', 'g2', 'g3', 'g5', 'p4'],
		], {
			level: { min: 11 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues red to Bob');
		// Since Bob has known plays a bluff should be possible on blue.
		takeTurn(game, 'Alice clues blue to Cathy');

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][2]].status, CARD_STATUS.BLUFFED);
	});

	it(`understands a complex play if the bluff isn't played into`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b3', 'g3', 'r3', 'g5'],
			['p1', 'r4', 'b5', 'b2'],
			['r2', 'b2', 'g1', 'y3']
		], {
			level: { min: 11 },
			starting: PLAYER.BOB
		});
		takeTurn(game, 'Bob clues blue to Donald');   // finesse for b1 on us

		// We expect that Cathy is bluffed.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);

		takeTurn(game, 'Cathy discards b2', 'y5');

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['b1']);
	});

	it('understands a bluff on top of unknown plays that cannot match', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'p3', 'y1', 'y1'],
			['g5', 'b2', 'r3', 'y5'],
			['b4', 'p2', 'g3', 'r5'],
		], {
			level: { min: 11 },
			play_stacks: [0, 0, 1, 0, 2],
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 1 to Bob');
		// Since Bob is only queued on 1s, Alice should be able to bluff Bob's p3 using g3.
		takeTurn(game, 'Alice clues 3 to Donald');

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][1]].status, CARD_STATUS.BLUFFED);
	});

	it(`computes connections correctly`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'], // Known g1*
			['b1', 'y2', 'r2', 'y4'],
			['y3', 'p2', 'y1', 'r4'],
			['g5', 'y1', 'p4', 'b5']
		], {
			level: {
				min: 11,
				max: 12, /* At level 13 a 3 bluff makes any 3 possible */
			},
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.CATHY,
			init: (game) => {
				// Bob's r2 is clued.
				preClue(game, game.state.hands[PLAYER.BOB][2], [{ type: CLUE.COLOUR, value: COLOUR.RED, giver: PLAYER.ALICE }]);
			}
		});

		takeTurn(game, 'Cathy clues yellow to Donald');
		takeTurn(game, 'Donald clues green to Alice (slots 3,4)');
		takeTurn(game, 'Alice clues 3 to Cathy');

		// Simplest interpretations: r2 (Bob) prompt, b1 (Bob) -> y2 (Bob) layered finesse
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]], ['r3', 'y3', 'b3']);
	});

	it(`doesn't confuse a bluff as a layered finesse`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g1', 'b1', 'y4', 'y3'], // After play b1, y2, r1, r2
			['g4', 'r5', 'b2', 'p4'],
			['r1', 'r1', 'r3', 'y1']
		], { level: { min: 11 } });

		takeTurn(game, 'Alice clues blue to Cathy');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['r1', 'y1', 'g1', 'b1', 'p1']);

		// Bob cannot receive a layered finesse as he cannot tell it apart from a bluff.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][1]].status, undefined);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][2]], game.level >= 13 ? ['b1', 'b2', 'b3'] : ['b1', 'b2']);
	});

	it(`prefers a bluff clue when more information is given 1`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p1', 'y5', 'b4', 'p5', 'p3'],
			['b3', 'r2', 'b2', 'b4', 'y4']
		], {
			level: { min: 11 },
			play_stacks: [0, 0, 5, 3, 0]
		});

		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { target: PLAYER.CATHY, type: ACTION.COLOUR, value: COLOUR.RED });
	});

	it(`prefers a bluff clue when more information is given case 2`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b4', 'p5', 'y5', 'g5'],
			['p3', 'p4', 'b2', 'p2'],
			['y2', 'p3', 'g3', 'p2']
		], {
			level: { min: 11 },
			play_stacks: [4, 1, 1, 3, 0]
		});

		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { target: PLAYER.CATHY, type: ACTION.COLOUR, value: COLOUR.PURPLE });
	});

	it('disambiguates a finesse when demonstrated', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p2', 'b4', 'y1', 'p4', 'g4'],
			['r3', 'p3', 'g1', 'y2', 'b3']
		], {
			level: { min: 11 },
			play_stacks: [1, 1, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Alice (slot 1)');
		takeTurn(game, 'Alice plays p1 (slot 2)');
		takeTurn(game, 'Bob plays p2 (slot 1)', 'r5');

		// Slot 2 (was slot 1) is known to be p3 as a double finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['p3']);
	});

	it('disambiguates a bluff when not demonstrated', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p2', 'b4', 'y1', 'p4', 'g4'],
			['r3', 'p3', 'g1', 'y2', 'b3']
		], {
			level: {
				min: 11,
				max: 12, /* At level 13 a 3 bluff makes any suit possible */
			},
			play_stacks: [1, 1, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Alice (slot 1)');
		takeTurn(game, 'Alice plays p1 (slot 2)');
		takeTurn(game, 'Bob clues green to Cathy');

		// Slot 2 (was slot 1) is known to be [r3,y3] as a bluff.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r3', 'y3']);
	});

	it('attempts to prompt when considering whether a bluff is valid', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b1', 'g1', 'p2', 'y3'],
			['r1', 'b1', 'r3', 'b4'],
			['b3', 'p3', 'r3', 'r2']
		], {
			level: { min: 11 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues blue to Alice (slots 1,3)');
		takeTurn(game, 'Alice plays b1 (slot 1)');
		takeTurn(game, 'Bob clues 4 to Alice (slot 1)');		// Could be b2 prompt (Alice) -> b3 finesse (Donald), or r1 bluff (Cathy) -> b3 prompt (Alice)

		// Cathy's r1 should be finessed as a possible bluff.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);

		takeTurn(game, 'Cathy plays r1', 'g2');

		// Alice's slot 3 should be known as b3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['b3']);
	});

	it('correctly interprets a bluff where a hidden finesse is impossible', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b4', 'g3', 'b3', 'm2'],
			['r2', 'y4', 'g4', 'y3'],
			['g2', 'b4', 'm4', 'y1']
		], {
			level: { min: 11 },
			starting: PLAYER.BOB,
			variant: VARIANTS.RAINBOW
		});

		takeTurn(game, 'Bob clues red to Alice (slot 2)');		// r1, m1
		takeTurn(game, 'Cathy clues red to Bob');				// m2 (promising m1 in Alice's hand)
		takeTurn(game, 'Donald clues red to Cathy');			// bluffing Alice (cannot be hidden finesse)

		// Alice's slot 1 should be finessed.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.BLUFFED);
	});
});

describe('guide principle', () => {
	it(`understands a bluff is not deferred by another bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b4', 'p2', 'b5', 'b3'],
			['y1', 'g2', 'p5', 'b2'],
			['g1', 'y5', 'b1', 'g5']
		], {
			level: { min: 11 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues red to Alice (slot 2)'); // Could be a bluff
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], game.level >= 13 ? ['r1', 'r2', 'r3'] : ['r1', 'r2']);

		takeTurn(game, 'Cathy clues purple to Bob'); // Cathy did not play and clued another bluff or finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r1']);
	});

	it(`understands a bluff is not deferred by a finesse`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b4', 'p2', 'b5', 'b3'],
			['y1', 'g2', 'p5', 'b2'],
			['p1', 'y5', 'b1', 'g5']
		], {
			level: { min: 11 },
			starting: PLAYER.BOB
		});
		takeTurn(game, 'Bob clues red to Alice (slot 2)'); // Could be a bluff
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], game.level >= 13 ? ['r1', 'r2', 'r3'] : ['r1', 'r2']);

		// A bluff can be deferred to perform a finesse per
		// https://hanabi.github.io/level-15#a-table-for-deferring-bluffs
		// but the circumstances would need to preclude anyone else accidentally playing into it.
		// For now, this is not allowed.
		takeTurn(game, 'Cathy clues purple to Bob'); // Cathy did not play and clued another bluff or finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r1']);
	});
});
