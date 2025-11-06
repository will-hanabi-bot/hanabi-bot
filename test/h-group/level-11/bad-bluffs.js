import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COLOUR, PLAYER, setup, takeTurn, VARIANTS } from '../../test-utils.js';
import * as ExAsserts from '../../extra-asserts.js';
import HGroup from '../../../src/conventions/h-group.js';
import { CLUE } from '../../../src/constants.js';
import { find_clues } from '../../../src/conventions/h-group/clue-finder/clue-finder.js';

import logger from '../../../src/tools/logger.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('bad bluffs', () => {
	it(`doesn't give a self colour bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'y2', 'g2', 'p2', 'b2'],
			['p4', 'r3', 'g1', 'y4', 'y3'],
		], {
			level: { min: 11 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 2 to Bob');

		// Alice should not give a self colour bluff to Bob.
		const { play_clues } = find_clues(game);
		assert.ok(!play_clues[PLAYER.BOB].some(clue =>
			clue.type === CLUE.COLOUR && clue.value === COLOUR.BLUE));
	});

	it(`doesn't bluff a card that isn't immediately playable`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y1', 'b5', 'y1', 'r1'],
			['y4', 'p1', 'g3', 'g4'],
			['y3', 'g1', 'g3', 'r1']
		], {
			level: { min: 11 },
			play_stacks: [1, 0, 0, 1, 2],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 1 to Donald');
		takeTurn(game, 'Donald plays r1', 'p1');

		const { play_clues } = find_clues(game);

		// We should not give 3 or green to Donald.
		assert.ok(!play_clues[PLAYER.DONALD].some(clue => (clue.type === CLUE.RANK && clue.value === 3) ||
			(clue.type === CLUE.COLOUR && clue.value === COLOUR.GREEN)));
	});

	it(`doesn't bluff through self finesses`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y1', 'b5', 'y1', 'r4', 'y4'],
			['p2', 'p3', 'g3', 'g4', 'y5'],
		], {
			level: { min: 11 }
		});

		const { play_clues } = find_clues(game);

		// We should not give 3 to Cathy.
		assert.ok(!play_clues[PLAYER.CATHY].some(clue => clue.type === CLUE.RANK && clue.value === 3));
	});

	it(`doesn't bluff when bluff can't be known by next player to play`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y1', 'b5', 'y1', 'r4', 'y4'],
			['p2', 'r2', 'b2', 'g4', 'y5'],
		], {
			level: { min: 11 }
		});

		const { play_clues } = find_clues(game);

		// We should not give 2 to Cathy, since y1 will connect.
		assert.ok(!play_clues[PLAYER.CATHY].some(clue => clue.type === CLUE.RANK && clue.value === 2));
	});

	it(`doesn't bluff when bluff can't be recognized by all players`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y1', 'b5', 'y2', 'y2', 'y4'],
			['p2', 'r2', 'b2', 'g4', 'y5'],
		], {
			level: { min: 11 }
		});

		const { play_clues } = find_clues(game);

		// Even though Cathy knows that she can't have y2, we still shouldn't bluff with 2 to Cathy.
		assert.ok(!play_clues[PLAYER.CATHY].some(clue => clue.type === CLUE.RANK && clue.value === 2));
	});

	it(`doesn't bluff when bluff can't be known not to connect to focus`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r2', 'r1', 'p2', 'r4'],
			['p3', 'p2', 'g1', 'g4'],
			['r1', 'r1', 'r4', 'g3']
		], {
			level: { min: 11 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues purple to Bob');
		takeTurn(game, 'Donald plays r1 (slot 1)', 'r5');

		// Bob knows he has a purple 2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][2]], ['p2']);

		const { play_clues } = find_clues(game);

		// A bluff through the p2 is invalid, because after the r2 plays, Cathy would think she has r3.
		assert.ok(!play_clues[PLAYER.CATHY].some(clue => clue.type === CLUE.RANK && clue.value === 3));
	});

	it(`doesn't bluff on top of unknown queued cards`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g1', 'r2', 'y1', 'y1', 'r4'],
			['p2', 'b2', 'r3', 'y5', 'y4'],
			['g1', 'g2', 'g3', 'g5', 'p4'],
		], {
			level: { min: 11 },
			play_stacks: [1, 0, 0, 0, 0],
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues red to Cathy');

		const { play_clues } = find_clues(game);

		// With g1, r2 already queued, we cannot bluff the y1 with (2/blue/purple to Cathy).
		assert.ok(!play_clues[PLAYER.CATHY].some(clue => (clue.type == CLUE.RANK && clue.value == 2) ||
			(clue.type == CLUE.COLOUR && (clue.value == COLOUR.BLUE || clue.value == COLOUR.PURPLE))));
	});

	it(`doesn't bluff a previously-finessed player`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y2', 'y1', 'g1', 'b5', 'r4'],
			['g2', 'r2', 'r3', 'y5', 'y4'],
		], {
			level: { min: 11 },
			variant: VARIANTS.PINK,
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 2 to Bob');		// Self-finesse
		takeTurn(game, 'Alice clues 2 to Cathy');	// Stacking g1 on top
		takeTurn(game, 'Bob plays y1', 'i1');

		takeTurn(game, 'Cathy clues 5 to Alice (slot 5)');

		const { play_clues } = find_clues(game);

		// With g1 queued, we can't bluff using r3.
		assert.ok(!play_clues[PLAYER.CATHY].some(clue =>
			(clue.type == CLUE.RANK && clue.value == 3) ||
			(clue.type == CLUE.COLOUR && clue.value == COLOUR.RED)));
	});

	it(`doesn't bluff on top of a possibly-layered gentleman's discard`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g1', 'y1', 'r2', 'y1', 'r4'],
			['g1', 'b2', 'g3', 'g5', 'p4'],
		], {
			level: { min: 11 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues green to Cathy');
		takeTurn(game, 'Cathy discards g1', 'y4');

		const { play_clues } = find_clues(game);

		// With g1, r2 already queued, we cannot bluff the y1 with (2/blue/purple to Cathy).
		assert.ok(!play_clues[PLAYER.CATHY].some(clue =>
			(clue.type == CLUE.RANK && clue.value == 2) ||
			(clue.type == CLUE.COLOUR && clue.value == COLOUR.BLUE)));
	});

	it(`doesn't bluff a card that it's likely to have clued in hand`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y2', 'b5', 'y1', 'r4'],
			['p2', 'r4', 'b4', 'g4'],
			['g2', 'r1', 'y1', 'g4'],
		], {
			level: { min: 11 },
			starting: PLAYER.BOB,
			play_stacks: [0, 0, 2, 2, 2]
		});

		takeTurn(game, 'Bob clues 2 to Alice (slot 4)'); // r2 or y2
		takeTurn(game, 'Cathy clues 1 to Donald');
		takeTurn(game, 'Donald plays y1', 'p1');

		const { play_clues } = find_clues(game);
		assert.ok(!play_clues[PLAYER.CATHY].some(clue => clue.type == CLUE.COLOUR && clue.value == COLOUR.BLUE));
	});

	it(`doesn't assume it can give a layered finesse when bluff target is likely a duplicate`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y2', 'b3', 'y1', 'r4'],
			['p2', 'r4', 'b4', 'g4'],
			['g2', 'r1', 'y1', 'g4'],
		], {
			level: { min: 11 },
			starting: PLAYER.BOB,
			play_stacks: [0, 0, 2, 2, 2]
		});

		takeTurn(game, 'Bob clues 2 to Alice (slot 4)'); // r2 or y2
		takeTurn(game, 'Cathy clues 1 to Donald');
		takeTurn(game, 'Donald plays y1', 'p1');

		const { play_clues } = find_clues(game);
		assert.ok(!play_clues[PLAYER.CATHY].some(clue => clue.type == CLUE.COLOUR && clue.value == COLOUR.BLUE));
	});

	it(`doesn't bluff on top of colour-clued cards which might match bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r4', 'y1', 'y1', 'y5'],
			['p4', 'b2', 'r3', 'b5', 'y4'],
		], { level: { min: 11 } });

		takeTurn(game, 'Alice clues red to Bob');
		takeTurn(game, 'Bob plays r1', 'g1');
		takeTurn(game, 'Cathy clues 5 to Bob');

		// Alice cannot use r3 to bluff Bob's g1, as r4 would play instead.
		const { play_clues } = find_clues(game);
		assert.ok(!play_clues[PLAYER.CATHY].some(clue =>
			(clue.type === CLUE.RANK && clue.value === 3) ||
			(clue.type === CLUE.COLOUR && clue.value === COLOUR.RED)));
	});

	it(`doesn't bluff on top of rank-clued cards which might match bluff`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y2', 'r2', 'y1', 'y1', 'y5'],
			['g4', 'b2', 'p3', 'b5', 'y4'],
		], {
			level: { min: 11 },
			play_stacks: [0, 1, 0, 0, 1]
		});

		takeTurn(game, 'Alice clues 2 to Bob');
		takeTurn(game, 'Bob plays y2', 'g1');
		takeTurn(game, 'Cathy clues 5 to Bob');

		// Alice cannot use p3 to bluff Bob's g1, as r2 would play instead.
		const { play_clues } = find_clues(game);
		assert.ok(!play_clues[PLAYER.CATHY].some(clue =>
			(clue.type === CLUE.RANK && clue.value === 3) ||
			(clue.type === CLUE.COLOUR && clue.value === COLOUR.PURPLE)));
	});

	it('does not give bluffs that need to be delayed', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p1', 'g3', 'p4', 'p3', 'b3'],
			['g1', 'y5', 'g4', 'r1', 'b1']
		], {
			level: { min: 11 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Cathy');
		takeTurn(game, 'Cathy plays b1', 'r4');

		const { play_clues } = find_clues(game);

		// 3 to Bob is not a valid bluff, since Bob needs to wait for g1 and r1 to play first.
		assert.ok(!play_clues[PLAYER.BOB].some(clue => clue.type === CLUE.RANK && clue.value === 3));
	});

	it('does not give bluffs that connect strangely', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b1', 'g1', 'p2', 'y3'],
			['r1', 'b1', 'r3', 'b4'],
			['r1', 'p3', 'r3', 'r2']
		], { level: { min: 11 } });

		const { play_clues } = find_clues(game);

		// 3 to Donald is not a valid bluff, since p3 is not 1-away.
		assert.ok(!play_clues[PLAYER.DONALD].some(clue => clue.type === CLUE.RANK && clue.value === 3));
	});

	it(`doesn't give a self-bluff that looks like an ambiguous self-finesse`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y4', 'g2', 'r3', 'y3', 'p3'],
			['r3', 'r4', 'y5', 'p4', 'r2']
		], {
			level: { min: 11 },
			play_stacks: [2, 2, 1, 0, 0]
		});

		const { play_clues } = find_clues(game);

		// 4 to Bob is not a valid self-bluff (looks r4).
		assert.ok(!play_clues[PLAYER.BOB].some(clue => clue.type === CLUE.RANK && clue.value === 4));
	});

	it(`doesn't give bluffs through unpromptable cards`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'b1', 'r3', 'y3'],
			['b1', 'g4', 'b4', 'b3'],
			['g2', 'p3', 'r3', 'b5']
		], {
			level: { min: 11 },
			starting: PLAYER.DONALD,
			play_stacks: [0, 0, 0, 2, 0],
			discarded: ['b4']
		});

		takeTurn(game, 'Donald clues blue to Cathy');		// could be b3 or b4

		const { play_clues } = find_clues(game);

		// Blue to Donald is not a valid bluff to get r1.
		assert.ok(!play_clues[PLAYER.DONALD].some(clue => clue.type === CLUE.COLOUR && clue.value === COLOUR.BLUE));
	});

	it(`doesn't bluff symmetrically finessed cards`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r2', 'y3', 'p4', 'y4'],
			['p3', 'r4', 'b2', 'b3'],
			['r3', 'y2', 'r1', 'b5']
		], {
			level: { min: 11 },
			play_stacks: [1, 0, 0, 2, 0],
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 3 to Cathy');	// could be r3 (finessing Bob) or b3 (direct)

		const { play_clues } = find_clues(game);

		// We should not give yellow to Donald as a bluff.
		assert.ok(!play_clues[PLAYER.DONALD].some(clue => clue.type === CLUE.COLOUR && clue.value === COLOUR.YELLOW));
	});

	it(`doesn't bluff symmetrically finessed cards 2`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r2', 'b3', 'p4', 'y4'],
			['y1', 'r4', 'b2', 'b3'],
			['r3', 'p2', 'r1', 'b5']
		], {
			level: { min: 11 },
			play_stacks: [1, 0, 0, 2, 0],
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 3 to Bob');	// could be y3 (finessing Cathy + self) or b3 (direct)

		const { play_clues } = find_clues(game);

		// We should not give purple to Donald as a bluff.
		assert.ok(!play_clues[PLAYER.DONALD].some(clue => clue.type === CLUE.COLOUR && clue.value === COLOUR.PURPLE));
	});

	it(`doesn't give bluffs when a delayed self interpretation exists`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r2', 'p4', 'g1', 'p3', 'y4'],
			['r4', 'y1', 'b2', 'r1', 'b3']
		], {
			level: { min: 11 },
			play_stacks: [1, 2, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 2 to Bob');

		const { play_clues } = find_clues(game);

		// We should not give 4 to Bob as a bluff, since Bob will play r2 first.
		assert.ok(!play_clues[PLAYER.BOB].some(clue => clue.type === CLUE.RANK && clue.value === 4));
	});
});
