import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COLOUR, PLAYER, preClue, setup, takeTurn } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import PlayfulSieve from '../../src/conventions/playful-sieve.js';

import { ACTION, CLUE } from '../../src/constants.js';
import { CARD_STATUS } from '../../src/basics/Card.js';

import logger from '../../src/tools/logger.js';
import { logPerformAction } from '../../src/tools/log.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('giving clues while locked', () => {
	it('gives colour clues to playable slot 1', async () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p1', 'b4', 'r5', 'r3', 'r3']
		]);

		takeTurn(game, 'Alice clues 5 to Bob');
		takeTurn(game, 'Bob clues red to Alice (slot 5)');

		// Alice should clue purple to Bob to tell him about p1.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.COLOUR, value: COLOUR.PURPLE, target: PLAYER.BOB });

		takeTurn(game, 'Alice clues purple to Bob');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][0]], ['p1']);
	});

	it('gives referential discards', async () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p5', 'b4', 'r5', 'r3', 'r1']
		]);

		takeTurn(game, 'Alice clues red to Bob');
		takeTurn(game, 'Bob clues red to Alice (slot 5)');

		// Alice should clue 5 to prevent Bob from discarding slot 1.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.RANK, value: 5, target: PLAYER.BOB });

		takeTurn(game, 'Alice clues 5 to Bob');

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][1]].status, CARD_STATUS.CALLED_TO_DC);
	});

	it('understands colour stalls', () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p3', 'b4', 'y1', 'r3', 'g4']
		], {
			discarded: ['r3']
		});

		takeTurn(game, 'Alice clues blue to Bob');
		takeTurn(game, 'Bob clues red to Alice (slot 5)');
		takeTurn(game, 'Alice clues red to Bob');

		// Bob should not be called to play slot 5.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][4]].status, undefined);

		// Slot 1 should have permission to discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].status, CARD_STATUS.CALLED_TO_DC);
	});

	it('doesn\'t take locked hand ptd on a known playable', () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p1', 'b4', 'b2', 'b3', 'b5']
		]);

		takeTurn(game, 'Alice plays r1 (slot 1)');
		takeTurn(game, 'Bob clues red to Alice (slot 5)');
		takeTurn(game, 'Alice clues blue to Bob');

		// Bob's slot 1 should not have permission to discard (should still be called to play).
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].status, CARD_STATUS.CALLED_TO_PLAY);
	});
});

describe('unlock promise', () => {
	it('unlocks from a directly connecting card', () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'b4', 'r5', 'g3', 'r3']
		]);

		takeTurn(game, 'Alice clues 5 to Bob');
		takeTurn(game, 'Bob clues red to Alice (slot 5)');
		takeTurn(game, 'Alice clues red to Bob');
		takeTurn(game, 'Bob plays r1', 'p1');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]], ['r2']);
	});

	it('unlocks from an unknown card', () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'b4', 'r5', 'g3', 'r3']
		]);

		takeTurn(game, 'Alice clues 5 to Bob');
		takeTurn(game, 'Bob clues purple to Alice (slot 5)');
		takeTurn(game, 'Alice clues red to Bob');
		takeTurn(game, 'Bob plays r1', 'p1');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['r2']);
	});

	it('unlocks from a shifted directly connecting card', () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'b4', 'r5', 'g3', 'r3']
		], {
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 2 to Alice (slots 3,4)');
		takeTurn(game, 'Alice discards y4 (slot 5)');
		takeTurn(game, 'Bob clues purple to Alice (slot 3)');		// Lock, Alice's hand is [xx, xx, p, 2, 2]

		takeTurn(game, 'Alice clues red to Bob');
		takeTurn(game, 'Bob discards b4', 'b1');
		takeTurn(game, 'Alice clues blue to Bob');
		takeTurn(game, 'Bob plays r1', 'p1');			// Bob plays r1 after shifting once

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['r2']);
	});

	it('unlocks from a new directly connecting card after a shift', () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'b4', 'r5', 'g3', 'r3']
		], {
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 2 to Alice (slots 3,4)');
		takeTurn(game, 'Alice discards y4 (slot 5)');
		takeTurn(game, 'Bob clues purple to Alice (slot 3)');		// Lock, Alice's hand is [xx, xx, p, 2, 2]

		takeTurn(game, 'Alice clues red to Bob');
		takeTurn(game, 'Bob discards b4', 'b1');
		takeTurn(game, 'Alice clues blue to Bob');
		takeTurn(game, 'Bob plays b1', 'p1');			// Bob plays b1 (after shifting once for r1)

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]], ['b2']);
	});

	it('unlocks from a shift past all directly connecting cards', () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'b4', 'r5', 'g3', 'r3']
		], {
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 2 to Alice (slot 4)');
		takeTurn(game, 'Alice discards y4 (slot 5)');
		takeTurn(game, 'Bob clues 5 to Alice (slots 2,3)');
		takeTurn(game, 'Alice discards b4 (slot 4)');
		takeTurn(game, 'Bob clues purple to Alice (slot 2)');		// Lock, Alice's hand is [xx, p, 5, 5, 2]

		takeTurn(game, 'Alice clues red to Bob');
		takeTurn(game, 'Bob discards b4', 'b1');
		takeTurn(game, 'Alice clues blue to Bob');
		takeTurn(game, 'Bob plays r1', 'p1');			// Bob plays r1 after shifting once

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r2']);
	});

	it('prefers unlocking over discarding trash', async () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g5', 'p2', 'r2', 'g4', 'r5']
		], {
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 3,4)');
		takeTurn(game, 'Alice clues 2 to Bob');
		takeTurn(game, 'Bob discards g4', 'p5');
		takeTurn(game, 'Alice clues red to Bob');				// Bob's hand is [xx, xx, 2, [r2], [r]5]
		takeTurn(game, 'Bob clues red to Alice (slots 3,4)');	// Alice's hand is [xx, xx, r1, r1, xx]

		const action = await game.take_action();

		// Alice should play r1 instead of discarding.
		assert.equal(action.type, ACTION.PLAY, `Actual action was (${logPerformAction(game, action)})`);
		assert.ok([2,3].map(index => game.state.hands[PLAYER.ALICE][index]).includes(action.target));
	});

	it('plays the closest card when none will unlock', async () => {
		const game = setup(PlayfulSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g5', 'y5', 'r3', 'p3', 'p5']
		], {
			starting: PLAYER.BOB,
			play_stacks: [0, 1, 0, 0, 0],
			discarded: ['r3'],
			init: (game) => {
				for (const order of game.state.hands[PLAYER.BOB]) {
					const card = game.state.deck[order];
					preClue(game, order, [
						{ type: CLUE.RANK, value: card.rank, giver: PLAYER.ALICE },
						{ type: CLUE.COLOUR, value: card.suitIndex, giver: PLAYER.ALICE }
					]);
				}
			}
		});

		takeTurn(game, 'Bob clues 2 to Alice (slots 2,3)');
		takeTurn(game, 'Alice discards y1 (slot 4)');
		takeTurn(game, 'Bob clues yellow to Alice (slots 3,5)');
		takeTurn(game, 'Alice discards b4 (slot 1)');
		takeTurn(game, 'Bob clues purple to Alice (slots 1,2)');	// Alice's hand is [p1, p, y2, 2, y]

		const action = await game.take_action();

		// Alice should play p1 instead of y2.
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] });
	});
});
