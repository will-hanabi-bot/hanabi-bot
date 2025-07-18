import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import * as ExAsserts from '../../extra-asserts.js';

import { COLOUR, PLAYER, VARIANTS, preClue, setup, takeTurn } from '../../test-utils.js';
import { ACTION, CLUE } from '../../../src/constants.js';
import { CARD_STATUS } from '../../../src/basics/Card.js';
import HGroup from '../../../src/conventions/h-group.js';
import { find_clues } from '../../../src/conventions/h-group/clue-finder/clue-finder.js';

import logger from '../../../src/tools/logger.js';
import { logClue } from '../../../src/tools/log.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('pink promise', () => {
	it('interprets pink promise on a play clue', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'b1', 'r2', 'r3', 'g5'],
		], {
			level: { min: 2 },
			play_stacks: [2, 0, 0, 0, 0],
			clue_tokens: 7,
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues 3 to Alice (slot 5)');

		// This should be known r3.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]], ['r3']);
	});

	it('gives play clues with pink promise', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['i1', 'b1', 'r2', 'r3', 'g5'],
		], {
			level: { min: 1 },
			clue_tokens: 7,
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		const { play_clues } = find_clues(game);

		// No rank clue should be a valid play clue except 1.
		assert.ok(!play_clues[PLAYER.BOB].some(clue => clue.type === CLUE.RANK && clue.value !== 1));
	});

	it('pink promises rightmost 5 in a 5 stall', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['i1', 'b1', 'r2', 'r3', 'g5'],
		], {
			level: { min: 1 },
			clue_tokens: 8,
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		game.common.updateThoughts(game.state.hands[PLAYER.ALICE][4], (draft) => { draft.updateStatus(CARD_STATUS.CM); });

		takeTurn(game, 'Bob clues 5 to Alice (slots 1,2,3,5)');

		// Slot 3 should be known as a 5.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r5', 'y5', 'g5', 'b5', 'i5']);
	});

	it('understands pink trash cms', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['i1', 'b1', 'r2', 'r3', 'g3'],
		], {
			level: { min: 4 },
			play_stacks: [1, 1, 1, 1, 1],
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues 1 to Alice (slot 3)');

		// Alice's slots 4 and 5 should be chop moved.
		assert.ok([3, 4].every(i => game.common.thoughts[game.state.hands[PLAYER.ALICE][i]].status, CARD_STATUS.CM));
	});

	it(`doesn't give illegal 5cms`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['i5', 'b1', 'r2', 'i1', 'g2'],
		], {
			level: { min: 4 },
			play_stacks: [0, 0, 0, 0, 2],
			clue_tokens: 4,
			variant: VARIANTS.PINK,
			init: (game) => {
				game.state.early_game = false;
			}
		});

		const { save_clues } = find_clues(game);

		// 5 to Bob is not a legal clue.
		assert.ok(save_clues[PLAYER.BOB] === undefined || !(save_clues[PLAYER.BOB].type === CLUE.RANK && save_clues[PLAYER.BOB].value === 5),
			`Expected not to 5cm, got ${logClue(save_clues[PLAYER.BOB])}`);
	});
});

describe('pink 1s assumption', () => {
	it('plays with pink 1s assumption', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['i1', 'b1', 'r2', 'r3', 'g4'],
		], {
			level: { min: 1 },
			clue_tokens: 7,
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 4,5)');
		takeTurn(game, 'Alice plays r1 (slot 5)');
		takeTurn(game, 'Bob discards g4', 'g5');

		const playables = game.common.thinksPlayables(game.state, PLAYER.ALICE);
		assert.ok(playables.includes(game.state.hands[PLAYER.ALICE][4]));
	});

	it('fixes a pink 1s assumption with pink fix promise', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r2', 'i4', 'i2', 'y1', 'g4'],
			['g3', 'b4', 'r5', 'y3', 'i1']
		], {
			level: { min: 3 },
			starting: PLAYER.CATHY,
			clue_tokens: 7,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Cathy clues 1 to Bob');
		takeTurn(game, 'Alice clues pink to Cathy');
		takeTurn(game, 'Bob plays y1', 'b4');
		takeTurn(game, 'Cathy clues 5 to Alice (slot 5)');

		const { fix_clues } = find_clues(game);
		assert.ok(fix_clues[PLAYER.BOB].some(clue => clue.type === CLUE.RANK && clue.value === 2));

		// Note that 4 is not a valid fix clue.
		assert.ok(!fix_clues[PLAYER.BOB].some(clue => clue.type === CLUE.RANK && clue.value === 4));

		takeTurn(game, 'Alice clues 2 to Bob');

		// Bob's slot 3 is promised to be i4.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['i2']);
	});

	it('fixes a pink 1s assumption without pink fix promise', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r2', 'i3', 'i1', 'r3', 'g5'],
		], {
			level: { min: 3 },
			clue_tokens: 7,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Alice clues 1 to Bob');
		takeTurn(game, 'Bob plays i1', 'b4');
		takeTurn(game, 'Alice clues 5 to Bob');

		// Bob's slot 3 is not promised to be i5.
		assert.ok(game.common.thoughts[game.state.hands[PLAYER.BOB][2]].inferred.length > 1);
	});

	it(`doesn't perform OCMs in pink`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'i3', 'i2', 'r1', 'g3'],
		], {
			level: { min: 4 },
			clue_tokens: 7,
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 4,5)');

		// Alice must play slot 5 (not allowed to OCM by playing slot 4).
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][4] });
	});
});

describe('pink prompts', () => {
	it('prompts leftmost correctly when rank matches', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'i3', 'i1', 'r4', 'g5'],
			['g4', 'y3', 'r2', 'b3', 'b1']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues 2 to Alice (slots 3,4,5)');
		takeTurn(game, 'Cathy clues red to Bob');

		// Alice should prompt slot 3 as r2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r2']);
	});

	it('finesses when rank mismatches', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y3', 'r1', 'r4', 'g5'],
			['g4', 'i3', 'r2', 'b3', 'b1']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			play_stacks: [0, 0, 0, 0, 1],
			starting: PLAYER.CATHY,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Cathy clues 5 to Alice (slots 3,4,5)');
		takeTurn(game, 'Alice discards g4 (slot 2)');
		takeTurn(game, 'Bob clues pink to Cathy');

		// Alice should finesse slot 1 as i2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['i2']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
	});

	it('prompts when two rank mismatches', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'i2', 'r4', 'r4', 'g5'],
			['g4', 'y3', 'r2', 'b3', 'b1']
		], {
			level: { min: 1 },
			clue_tokens: 7,
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues 2 to Alice (slots 3,4,5)');
		takeTurn(game, 'Cathy clues 5 to Alice (slots 2,3)');	// Slot 3 is revealed pink: Alice's hand is [xx _5 i_ _2 _2]
		takeTurn(game, 'Alice discards b3 (slot 1)');

		takeTurn(game, 'Bob clues blue to Cathy');
		takeTurn(game, 'Cathy clues pink to Bob');

		// Alice should prompt slot 3 as i1.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['i1']);
	});

	it('prompts even when rank mismatches if no finesse position', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['i3', 'b3', 'r1', 'r4', 'g5'],
			['g4', 'y3', 'r2', 'b3', 'b1']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			play_stacks: [0, 0, 0, 0, 1],
			discarded: ['y4'],
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues yellow to Alice (slots 3,4,5)');
		takeTurn(game, 'Cathy clues 5 to Alice (slots 1,2)');
		takeTurn(game, 'Alice clues red to Bob');

		takeTurn(game, 'Bob plays r1', 'r1');
		takeTurn(game, 'Cathy clues pink to Bob');

		// Alice should play slot 1 as i2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['i2']);
	});

	it('understands a mismatched rank prompt', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b3', 'i3', 'r1', 'r4', 'g5'],
			['i2', 'b5', 'y2', 'y3', 'y4']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			play_stacks: [0, 0, 0, 0, 1],
			discarded: ['y4'],
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Alice clues yellow to Cathy');
		takeTurn(game, 'Bob clues 5 to Cathy');
		takeTurn(game, 'Cathy clues red to Alice (slot 3)');

		takeTurn(game, 'Alice plays r1 (slot 3)');
		takeTurn(game, 'Bob clues 3 to Alice (slots 2,3)');

		// Alice should understand Cathy's i2 is prompted, and not self-finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['i3']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, undefined);
	});

	it('understands a known bluff when rank mismatches', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y1', 'r4', 'r4', 'y4'],
			['y4', 'g4', 'g4', 'b4'],
			['y2', 'b1', 'i5', 'b4']
		], {
			level: { min: 11 },
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Alice clues 2 to Donald');
		takeTurn(game, 'Bob plays y1', 'i4');
		takeTurn(game, 'Cathy clues pink to Alice (slot 4)');

		// This could be a known bluff on Donald's b1.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['i1', 'i2']);

		takeTurn(game, 'Donald plays b1', 'i4');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['i2']);
	});
});

describe('pink trash', () => {
	it('interprets a pink trash chop move', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'i3', 'i1', 'r4', 'g5'],
			['g4', 'y3', 'r2', 'i4', 'i2']
		], {
			level: { min: 4 },
			clue_tokens: 7,
			play_stacks: [1, 1, 1, 1, 1],
			starting: PLAYER.CATHY,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Cathy clues 1 to Alice (slots 2,3)');

		// Alice's slots 3 and 4 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);

		// Alice's slots 2 and 3 should be known trash.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r1', 'y1', 'g1', 'b1', 'i1']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r1', 'y1', 'g1', 'b1', 'i1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].trash, true);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].trash, true);
	});
});

describe('pink choice tempo clues', () => {
	it('gives a pink choice tempo clue', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g4', 'y3', 'r2', 'b3', 'b1'],
			['r1', 'i1', 'i3', 'i2', 'g5']
		], {
			level: { min: 6 },
			clue_tokens: 7,
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues pink to Cathy');
		takeTurn(game, 'Cathy plays i1', 'b2');

		// 4 to Cathy is a valid pink choice tempo clue.
		const { play_clues } = find_clues(game);
		assert.ok(play_clues[PLAYER.CATHY].some(clue => clue.type === CLUE.RANK && clue.value === 4));
	});

	it('understands a pink choice tempo clue', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g4', 'y3', 'r2', 'b3', 'b1'],
			['r3', 'b1', 'b3', 'b2', 'g5']
		], {
			level: { min: 6 },
			clue_tokens: 7,
			starting: PLAYER.CATHY,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Cathy clues 5 to Alice (slots 3,4,5)');
		takeTurn(game, 'Alice clues blue to Bob');
		takeTurn(game, 'Bob clues 4 to Alice (slots 3,4,5)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['i1']);

		// Alice is not TCCM'd.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, undefined);
	});

	it('understands a pink choice finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g4', 'y3', 'r2', 'b3', 'b1'],
			['i1', 'b1', 'b3', 'b2', 'g5']
		], {
			level: { min: 6 },
			clue_tokens: 7,
			starting: PLAYER.CATHY,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Cathy clues 5 to Alice (slots 3,4,5)');
		takeTurn(game, 'Alice clues blue to Bob');
		takeTurn(game, 'Bob clues 4 to Alice (slots 3,4,5)');

		// Cathy might be finessed for i1.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['i2']);

		takeTurn(game, 'Cathy clues green to Alice (slot 1)');

		// Alice knows that she only has i1, and she is not TCCM'd.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['i1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, undefined);
	});

	it('interprets a pink choice tempo clue over a pink fix', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y3', 'r1', 'r4', 'g5'],
			['g4', 'i3', 'r2', 'b3', 'b1']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			play_stacks: [0, 0, 0, 0, 1],
			starting: PLAYER.CATHY,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Cathy clues pink to Alice (slots 1,5)');
		takeTurn(game, 'Alice plays i2 (slot 5)');
		takeTurn(game, 'Bob clues 2 to Alice (slot 2)');

		// Slot 2 should be i3, not trash.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['i3']);
	});

	it(`doesn't try to self-prompt using a pink positional`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y3', 'r1', 'i4', 'i3'],
			['g4', 'i1', 'r2', 'b3', 'b1']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			play_stacks: [0, 0, 0, 0, 2],
			discarded: ['i3', 'i4'],
			starting: PLAYER.CATHY,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Cathy clues pink to Bob');		// i3,i4 save

		const { play_clues } = find_clues(game);

		// 4 to Bob is not a valid self-prompt.
		assert.ok(!play_clues[PLAYER.BOB].some(clue => clue.type === CLUE.RANK && clue.value === 4));
	});

	it(`doesn't try to self-prompt using a rewinded pink positional`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['o3', 'r4', 'y4', 'g4', 'b4'],
			['o4', 'r4', 'y4', 'g4', 'b4']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			play_stacks: [0, 0, 0, 0, 1],
			starting: PLAYER.CATHY,
			variant: VARIANTS.OMNI,
			init: (game) => {
				// ALice's slots 4 and 5 are known omni.
				for (const s of [3, 4]) {
					preClue(game, game.state.hands[PLAYER.ALICE][s], [
						{ type: CLUE.RANK, value: 1, giver: PLAYER.CATHY },
						{ type: CLUE.RANK, value: 5, giver: PLAYER.CATHY }
					]);
				}
			}
		});

		takeTurn(game, 'Cathy clues 4 to Alice (slots 4,5)');		// positional on o2
		takeTurn(game, 'Alice clues yellow to Cathy');				// selfish finesse i4
		takeTurn(game, 'Bob discards b4', 'r1');

		takeTurn(game, 'Cathy clues red to Alice (slots 1,4,5)');		// reverse finesse on r2
		takeTurn(game, 'Alice plays o2 (slot 4)');
		takeTurn(game, 'Bob plays o3', 'y1');						// Bob plays into older finesse first

		takeTurn(game, 'Cathy plays o4', 'g1');

		// Alice's red card can be either r1 or r2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r1', 'r2']);

		takeTurn(game, 'Alice bombs o2 (slot 5)');					// trying to play o5 from good touch
		takeTurn(game, 'Bob plays r1 (slot 2)', 'b1');

		// Alice's red card is now confirmed to be r2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r2']);
	});
});

describe('pink fixes', () => {
	it('gives a pink fix', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'i3', 'i1', 'r4', 'g5'],
			['g4', 'y3', 'r2', 'i1', 'i2']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			play_stacks: [0, 0, 0, 0, 1],
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Bob clues 2 to Cathy');		// i2 play
		takeTurn(game, 'Cathy plays i2', 'b3');

		// 1 to Cathy is a valid pink fix.
		const { fix_clues } = find_clues(game);
		assert.ok(fix_clues[PLAYER.CATHY].some(clue => clue.type === CLUE.RANK && clue.value === 1));
	});

	it('interprets a pink trash fix', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y3', 'r1', 'r4', 'g5'],
			['g4', 'i3', 'r2', 'b3', 'b1']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			play_stacks: [0, 0, 0, 0, 1],
			starting: PLAYER.CATHY,
			variant: VARIANTS.PINK
		});

		takeTurn(game, 'Cathy clues 2 to Alice (slots 4,5)');
		takeTurn(game, 'Alice plays i2 (slot 5)');
		takeTurn(game, 'Bob clues 1 to Alice (slot 5)');

		// Slot 5 should be known trash.
		const trash = game.common.thinksTrash(game.state, PLAYER.ALICE);
		assert.ok(trash.some(o => o === game.state.hands[PLAYER.ALICE][4]));
	});

	it(`doesn't interpret a pink fix after a prompt`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r3', 'y3', 'r4', 'y4', 'i2'],
			['g4', 'i4', 'g3', 'b3', 'b4']
		], {
			level: { min: 3 },
			clue_tokens: 7,
			starting: PLAYER.BOB,
			variant: VARIANTS.PINK,
			init: (game) => {
				// Alice's slot 1 is known b1.
				preClue(game, game.state.hands[PLAYER.ALICE][0], [{ type: CLUE.COLOUR, value: COLOUR.BLUE, giver: PLAYER.CATHY }]);

				// Bob's slot 5 is clued with pink.
				preClue(game, game.state.hands[PLAYER.BOB][4], [{ type: CLUE.COLOUR, value: 4, giver: PLAYER.ALICE }]);
			}
		});

		takeTurn(game, 'Bob clues 5 to Alice (slots 4,5)');
		takeTurn(game, 'Cathy clues 2 to Bob');					// prompt Alice's slot 4 as i1

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['i1']);

		takeTurn(game, 'Alice plays b1 (slot 1)');				// Alice draws a new 5
		takeTurn(game, 'Bob clues 5 to Alice (slots 1,4,5)');	// 5 Stall (not a pink fix)

		// Slot 4 should still be i1.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['i1']);
	});
});
