import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { ACTION } from '../../src/constants.js';
import { PLAYER, setup, takeTurn, expandShortCard, VARIANTS } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';
// import { find_clues } from '../../src/conventions/h-group/clue-finder/clue-finder.js';

import logger from '../../src/tools/logger.js';
import { logPerformAction } from '../../src/tools/log.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('trash push', () => {
	it('interprets trash pushes', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'r4', 'r2', 'r5', 'b1']
		], {
			level: { min: 14 },
			play_stacks: [4, 4, 4, 4, 4]
		});

		takeTurn(game, 'Alice clues 1 to Bob (slot 5)');

		// Slot 4 should be a 5
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['r5', 'y5', 'g5', 'b5', 'p5']);
	});

	it('allows trash pushes through clued cards', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'r4', 'p2', 'g4', 'b1'],
			['b2', 'y4', 'y2', 'r5', 'y1']
		], {
			level: { min: 14 },
			play_stacks: [3, 4, 4, 4, 4],
      			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Bob (slot 2)');
		takeTurn(game, 'Alice clues 1 to Cathy (slot 5)');

		// Slot 4 should be playable or delayed playable
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]], ['r4', 'r5', 'y5', 'g5', 'b5', 'p5']);
	});

	it('plays the correct card when some cards are chop moved', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'p1', 'g1', 'b1'],
			['r1', 'p1', 'y1', 'b1'],
		], {
			level: { min: 14 },
			play_stacks: [2, 5, 5, 5, 5],
      			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slot 3)');
		takeTurn(game, 'Cathy clues 2 to Alice (slot 2)');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r3']);

		// Alice should play slot 1.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] }, `Expected (play slot 1) but got ${logPerformAction(action)}`);
	});

	it('plays into trash push finesses', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r3', 'p3', 'r5', 'b1'],
			['r1', 'p1', 'y1', 'b1'],
		], {
			level: { min: 14 },
			play_stacks: [3, 5, 5, 5, 5],
      			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 1 to Bob (slot 4)');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r4']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][2]], ['r4', 'r5']);

		// Alice should play r4.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] }, `Expected (play r4) but got ${logPerformAction(action)}`);
	});

	it('plays into trash pushes immediately', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g5', 'p1', 'g1', 'b1'],
			['r4', 'p1', 'y1', 'b1'],
		], {
			level: { min: 14 },
			play_stacks: [3, 4, 4, 5, 5],
      			starting: PLAYER.ALICE
		});

		takeTurn(game, 'Alice clues 4 to Cathy (slot 1)');
		takeTurn(game, 'Bob clues 1 to Alice (slot 4)');
		takeTurn(game, 'Cathy clues 5 to Bob (slot 1)');

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].trash_pushed, true);

		// Alice should not wait for Cathy to play r4.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][2] }, `Expected (play slot 3) but got ${logPerformAction(action)}`);
	});

	it('does not consider illegal trash pushes', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r3', 'y3', 'g1', 'b1'],
			['p4', 'r4', 'r1', 'y1'],
		], {
			level: { min: 14 },
			play_stacks: [2, 2, 5, 5, 5],
      			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 3 to Bob (slots 1,2)');
		takeTurn(game, 'Alice clues 1 to Cathy (slots 3,4)');

		// Cathy should not consider y4.
		assert.ok(!game.common.thoughts[game.state.hands[PLAYER.CATHY][1]].inferred.has(expandShortCard('y4')));

	});

	it('does not entertain bluffs on trash pushed players', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r3', 'y3', 'g1', 'b1'],
			['g4', 'b3', 'p3', 'y2'],
		], {
			level: { min: 14 },
			play_stacks: [2, 2, 3, 5, 5],
      			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 1 to Bob (slots 3,4)');
		takeTurn(game, 'Alice clues green to Cathy (slot 1)');

		// Cathy should not consider g5.
		assert.ok(!game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].inferred.has(expandShortCard('g5')));
	});
});

describe('trash order chop move', () => {
	it('cms if the not leftmost trash is discarded', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r5', 'g5', 'y1', 'g1', 'g3']
		], {
			level: { min: 14 },
			play_stacks: [1, 1, 1, 1, 1],
			starting: PLAYER.ALICE
		});

		takeTurn(game, 'Alice clues 1 to Bob (slots 3,4)');
		takeTurn(game, 'Bob discards g1 (slot 4)', 'b5');

		// Alice should chop move.
		assert.ok(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].chop_moved);
	});

	it('chop moves the correct player', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r5', 'b1', 'y1', 'g1', 'g3'],
			['r1', 'r1', 'y1', 'g1', 'p1']
		], {
			level: { min: 14 },
			play_stacks: [1, 1, 1, 1, 1],
			starting: PLAYER.ALICE
		});

		takeTurn(game, 'Alice clues 1 to Bob (slots 2,3,4)');
		takeTurn(game, 'Bob discards g1 (slot 4)', 'b5');

		// Alice should chop move. Cathy shouldn't.
		assert.ok(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].chop_moved);
		assert.ok(!game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].chop_moved);
	});

	it('performs a TOCM for good cards', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r5', 'p3', 'g4', 'p4', 'y4'],
			['r1', 'y1', 'g1', 'p2', 'g2']
		], {
			level: { min: 14 },
			play_stacks: [2, 2, 4, 1, 4],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 1 to Alice (slots 3,4)');

		// Alice should discard slot 4 to chop move yellow 3.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][3] }, `Expected (Discard slot 4) but got ${logPerformAction(action)}`);
	});
});
