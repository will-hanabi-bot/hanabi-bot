import { describe, it, skip } from 'node:test';
import { strict as assert } from 'node:assert';

import {ACTION, CLUE} from '../../src/constants.js';
import {PLAYER, preClue, setup, takeTurn} from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';

import { logCard, logClue } from '../../src/tools/log.js';
import logger from '../../src/tools/logger.js';
import RefSieve from "../../src/conventions/ref-sieve.js";
import {CLUE_INTERP} from "../../src/conventions/ref-sieve/rs-constants.js";

logger.setLevel(logger.LEVELS.ERROR);

describe('fix clues', () => {
	it('gives a negative fix clue to stop card from bombing', async () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y1', 'b1', 'r5', 'r3', 'g3']
		], {
			play_stacks: [0, 0, 1, 1, 1],
		});

		takeTurn(game, 'Alice clues 1 to Bob');
		takeTurn(game, 'Bob plays y1 (slot 1)', 'b1');

		// Alice should give red to fix.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.COLOUR, value: 0 });
	});

	it('understands a negative fix clue that stops card from bombing', () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p4', 'p4', 'y5', 'y3', 'g3']
		], {
			play_stacks: [0, 0, 1, 1, 1],
			starting: PLAYER.BOB,
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 1,2)');
		takeTurn(game, 'Alice plays y1 (slot 1)');

		const slot2 = game.common.thoughts[game.state.hands[PLAYER.ALICE][1]];
		logger.debug(slot2.inferred.map(logCard));
		const playables = game.common.thinksPlayables(game.state, PLAYER.ALICE);
		assert.ok(playables.includes(slot2.order));

		takeTurn(game, 'Bob clues red to Alice (slots 3,4)');

		// Alice's slot 2 should be trash
		const trash = game.common.thinksTrash(game.state, PLAYER.ALICE);
		assert.ok(trash.includes(slot2.order));

		// Alice's slot 1 should not be called to play.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].called_to_play, false);
		// assert.equal(game.common.thinksPlayables(game.state, PLAYER.ALICE).length, 0);
	});

	it(`doesn't give a negative fix clue that doesn't stop card from bombing`, () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b1', 'b2', 'r5', 'r4', 'g4']
		], {
			play_stacks: [0, 2, 2, 2, 2],
			init: (game) => {
				preClue(game, game.state.hands[PLAYER.BOB][1], [{ type: CLUE.RANK, value: 2, giver: PLAYER.ALICE }]);
			}
		});

		// takeTurn(game, 'Alice clues 2 to Bob');
		// takeTurn(game, 'Bob plays y2 (slot 1)', 'b1');
		takeTurn(game, 'Alice clues red to Bob'); // "fixing" Bob's "r2"

		// This clue is nonsensical.
		assert.equal(game.lastMove, CLUE_INTERP.NONE);
	});

	it(`understands fix clue that doesn't stop bomb as play clue`, () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p4', 'p4', 'y5', 'y3', 'g3']
		], {
			play_stacks: [0, 2, 2, 2, 2],
			starting: PLAYER.BOB,
			init: (game) => {
				// Alice's slot 2 is known 2 that looks like r2, but is actually trash b2
				preClue(game, game.state.hands[PLAYER.ALICE][1], [{ type: CLUE.RANK, value: 2, giver: PLAYER.BOB }]);
			}
		});

		// takeTurn(game, 'Bob clues red to Alice (slot 3)'); // neg fixing Alice's "r2" with ref play
		takeTurn(game, 'Bob clues blue to Alice (slots 2,3)'); // fixing Alice's "r2" with ref play

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].called_to_play, true);
	});

	it('understands a normal fix clue touching new cards', () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p4', 'p4', 'y5', 'y3', 'g3']
		], {
			play_stacks: [0, 0, 1, 1, 1],
			starting: PLAYER.BOB,
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 1,2)');
		takeTurn(game, 'Alice plays y1 (slot 1)');

		const slot2 = game.common.thoughts[game.state.hands[PLAYER.ALICE][1]];
		logger.debug(slot2.inferred.map(logCard));
		const playables = game.common.thinksPlayables(game.state, PLAYER.ALICE);
		assert.ok(playables.includes(slot2.order));

		takeTurn(game, 'Bob clues blue to Alice (slots 2,3)');

		// Alice's slot 2 should be trash
		const trash = game.common.thinksTrash(game.state, PLAYER.ALICE);
		assert.ok(trash.includes(slot2.order));

		// Alice's cards should not be called to play.
		assert.equal(game.common.thinksPlayables(game.state, PLAYER.ALICE).length, 0);
	});

	it('understands a fix clue revealing duplicates', () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b4', 'r5', 'r3', 'g3']
		], {
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues yellow to Alice (slots 2,3)');
		takeTurn(game, 'Alice plays b1 (slot 1)');
		takeTurn(game, 'Bob clues 4 to Alice (slots 2,3)');

		// Alice's cards should not be called to play.
		assert.equal(game.common.thinksPlayables(game.state, PLAYER.ALICE).length, 0);
	});

	it('understands a fix clue revealing duplicate playables', () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b4', 'r5', 'r3', 'g3']
		], {
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 1,2,3)');
		takeTurn(game, 'Alice plays r1 (slot 1)');
		takeTurn(game, 'Bob clues blue to Alice (slots 2,3,4)');

		// Alice's slot 1 should not be called to play.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].called_to_play, false);
	});

	it('gives fix clue on previously untouched card', async () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b1', 'p4', 'r5', 'r3', 'g3']
		]);

		takeTurn(game, 'Alice clues purple to Bob');  // ref play on b1
		takeTurn(game, 'Bob clues purple to Alice (slot 2)');  // ref play on b1
		takeTurn(game, 'Alice plays b1 (slot 1)');
		takeTurn(game, 'Bob clues 5 to Alice (slot 1)');

		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.COLOUR, value: 3 });
	});

	skip('understands fix clue on previously untouched card', () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b1', 'p4', 'r5', 'r3', 'g3']
		], {
			starting: PLAYER.BOB,
		});

		takeTurn(game, 'Bob clues purple to Alice (slot 2)');  // ref play on b1
		takeTurn(game, 'Alice clues purple to Bob');  // ref play on b1
		takeTurn(game, 'Bob plays b1 (slot 1)', 'r3');
		takeTurn(game, 'Alice clues 5 to Bob (slot 3)');
		takeTurn(game, 'Bob clues blue to Alice (slots 1,4)');  // fix on untouched b1

		// Alice's cards should not be called to play.
		//Currently conflict between possible, inferred, and info_lock card identities
		logger.warn(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].inferred.map(logCard));
		logger.warn(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].possible.map(logCard));
		logger.warn(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].info_lock.map(logCard));
		logger.warn(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].clues.map(logClue));
		assert.equal(game.common.thinksPlayables(game.state, PLAYER.ALICE).length, 0);
	});

	skip('understands a fix reclue', () => {
		const game = setup(RefSieve, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p4', 'p4', 'r5', 'r3', 'g3']
		], {
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.BOB,
		});

		takeTurn(game, 'Bob clues 1 to Alice (slot 1,2)');
		takeTurn(game, 'Alice plays b1 (slot 1)');

		const slot2 = game.common.thoughts[game.state.hands[PLAYER.ALICE][1]];
		logger.debug(slot2.inferred.map(logCard));
		let playables = game.common.thinksPlayables(game.state, PLAYER.ALICE);
		assert.ok(playables.includes(slot2.order));

		// Attempt to fix
		takeTurn(game, 'Bob clues 1 to Alice (slot 2)');

		// Alice's slot 2 should not be playable.
		logger.debug(slot2);
		playables = game.common.thinksPlayables(game.state, PLAYER.ALICE);
		assert.ok(!playables.includes(slot2.order));

		// Alice's slot 2 should be trash
		const trash = game.common.thinksTrash(game.state, PLAYER.ALICE);
		assert.ok(trash.includes(slot2.order));
	});
});
