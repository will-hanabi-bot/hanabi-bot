import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COLOUR, PLAYER, VARIANTS, setup, takeTurn } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';
import { ACTION, CLUE } from '../../src/constants.js';
import { CARD_STATUS } from '../../src/basics/Card.js';
import { clue_safe } from '../../src/conventions/h-group/clue-finder/clue-safe.js';
import { find_clues } from '../../src/conventions/h-group/clue-finder/clue-finder.js';

import logger from '../../src/tools/logger.js';
import { logPerformAction } from '../../src/tools/log.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('ambiguous clues', () => {
	it('understands a fake finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g4', 'r5', 'b4'],
			['g1', 'b3', 'r2', 'y3', 'p3']
		], {
			level: { min: 5 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues green to Alice (slot 2)');

		// Alice's slot 2 should be [g1,g2].
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['g1', 'g2']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].reasoning_turn.length, 1);

		takeTurn(game, 'Cathy discards p3', 'r1');

		// Alice's slot 2 should just be g1 now.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['g1']);
	});

	it(`doesn't eliminate from a possibly-fake finesse`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b3', 'y1', 'p1', 'r4'],
			['g4', 'r1', 'r3', 'r2'],
			['b1', 'b2', 'p4', 'p3']
		], {
			level: { min: 5 },
			play_stacks: [5, 5, 5, 0, 1],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 2 to Alice (slot 4)');		// b2, p2 save
		takeTurn(game, 'Cathy clues blue to Bob');				// b1, b2 finesse (though b2 could be on us)
		takeTurn(game, 'Donald plays b1', 'b1');

		// Our slot 4 could be b2 or p2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['b2', 'p2']);
	});

	it('understands a self-connecting play clue', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g4', 'r5', 'b4'],
			['g3', 'b3', 'r2', 'y3', 'p3']
		], {
			level: { min: 5 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slot 4)');
		takeTurn(game, 'Cathy clues 2 to Alice (slot 3)');
		takeTurn(game, 'Alice plays g1 (slot 4)');

		// Alice's slot 4 (used to be slot 3) should just be g2 now.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['g2']);
	});

	it('understands a delayed finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p4', 'r4', 'g4', 'r5', 'b4'],
			['r3', 'b3', 'r2', 'y3', 'p3']
		], {
			level: { min: 5 },
			play_stacks: [1, 0, 1, 1, 0]
		});

		takeTurn(game, 'Alice clues 2 to Cathy');
		takeTurn(game, 'Bob clues red to Alice (slot 3)');

		// Alice's slot 3 should be [r3,r4].
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r3', 'r4']);

		takeTurn(game, 'Cathy plays r2', 'y1');

		// Alice's slot 3 should still be [r3,r4] to allow for the possibility of a hidden finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r3', 'r4']);

		takeTurn(game, 'Alice discards b1 (slot 5)');
		takeTurn(game, 'Bob discards b4', 'r1');
		takeTurn(game, 'Cathy plays r3', 'g1');

		// Alice's slot 4 (used to be slot 3) should be just [r4] now.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['r4']);
	});

	it('understands a fake delayed finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p4', 'r4', 'g4', 'r5', 'b4'],
			['r2', 'b3', 'r1', 'y3', 'p3']
		], {
			level: { min: 5 },
			clue_tokens: 7
		});

		takeTurn(game, 'Alice clues 1 to Cathy');
		takeTurn(game, 'Bob clues red to Alice (slot 3)');
		takeTurn(game, 'Cathy plays r1', 'y1');

		takeTurn(game, 'Alice discards b1 (slot 5)');
		takeTurn(game, 'Bob discards b4', 'r1');
		takeTurn(game, 'Cathy discards p3', 'g1');

		// Alice's slot 4 (used to be slot 3) should be just [r2] now.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['r2']);
	});

	it('understands that a self-finesse may not be ambiguous', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g2', 'p4', 'r2', 'r3', 'g4'],
			['p2', 'p1', 'b3', 'y3', 'b4']
		], {
			level: { min: 5 },
			clue_tokens: 4,
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 2 to Cathy');
		takeTurn(game, 'Cathy discards b4', 'r4');

		// Alice can deduce that she has a playable card on finesse position, but shouldn't play it.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, undefined);
		assert.ok(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].inferred.length > 1);
	});

	it(`still finesses if cards in the finesse are clued, as long as they weren't the original finesse target`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'b1', 'g3', 'r1'],
			['p5', 'g3', 'p1', 'b3'],
			['p1', 'b1', 'r3', 'g1']
		], {
			level: { min: 5 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues blue to Cathy');			// r1, b1 layer -> b2 on us
		takeTurn(game, 'Cathy clues 5 to Alice (slot 4)');
		takeTurn(game, 'Donald plays p1', 'b4');
		takeTurn(game, 'Alice clues 1 to Donald');			// getting g1, but touches b1

		takeTurn(game, 'Bob clues blue to Donald');			// focusing b4, but filling in b1
		takeTurn(game, 'Cathy discards p1', 'g4');
		takeTurn(game, 'Donald plays b1', 'b5');

		// Alice's b2 in slot 1 should still be finessed.
		const slot1 = game.common.thoughts[game.state.hands[PLAYER.ALICE][0]];
		assert.equal(slot1.status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[slot1.order], ['b2']);
	});

	it('cancels finesse connections when clued elsewhere', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'y5', 'g3', 'y3'],
			['p5', 'g3', 'p1', 'b3'],
			['p4', 'y2', 'r3', 'g1']
		], {
			level: { min: 5 },
			play_stacks: [1, 1, 0, 2, 0]
		});

		takeTurn(game, 'Alice clues yellow to Donald');
		takeTurn(game, 'Bob clues 4 to Alice (slot 2)');		// Could be y4,b4
		takeTurn(game, 'Cathy clues yellow to Bob');			// focusing y3

		// Alice's slot 1 should be known b3.
		const slot1 = game.common.thoughts[game.state.hands[PLAYER.ALICE][0]];
		assert.equal(slot1.status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[slot1.order], ['b3']);
	});

	it(`doesn't confirm symmetric finesses after a "stomped play"`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'p2', 'b2', 'p2'],
			['y1', 'g4', 'g3', 'y4'],
			['y1', 'g1', 'y3', 'r4']
		], {
			level: { min: 5 },
			clue_tokens: 7,
			play_stacks: [0, 0, 3, 1, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues yellow to Donald');
		takeTurn(game, 'Donald plays y1', 'p1');

		takeTurn(game, 'Alice discards g1 (slot 4)');
		takeTurn(game, 'Bob clues 4 to Cathy');				// y2 finesse on us, y3 prompt, y4 (symmetrically, could be purple)
		takeTurn(game, 'Cathy clues 1 to Donald');
		takeTurn(game, 'Donald plays p1', 'p1');

		// Alice's y2 in slot 1 should still be finessed.
		const slot1 = game.common.thoughts[game.state.hands[PLAYER.ALICE][0]];
		assert.equal(slot1.status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[slot1.order], ['y2']);
	});

	it(`eliminates all finesse possibilities when a player doesn't play`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b5', 'r4', 'r1', 'r1'],
			['y4', 'm4', 'b4', 'b2'],
			['m3', 'g1', 'y1', 'b1']
		], {
			level: { min: 5 },
			variant: VARIANTS.RAINBOW,
			play_stacks: [0, 2, 0, 0, 1],
			starting: PLAYER.DONALD,
		});

		takeTurn(game, 'Donald clues green to Alice (slots 2,3,4)');
		takeTurn(game, 'Alice plays m2 (slot 4)');
		takeTurn(game, 'Bob discards r1 (slot 4)', 'b1');
		takeTurn(game, 'Cathy clues blue to Donald');

		// Clue could be b1 finesse (Bob) -> b2 (Donald)
		assert.ok(game.common.waiting_connections.some(wc => wc.inference.suitIndex === COLOUR.BLUE && wc.inference.rank === 2 && wc.target === PLAYER.DONALD));

		takeTurn(game, 'Donald clues 3 to Alice (slots 2,3)');		// b1 reverse + self composition finesse, y3 direct

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['y3', 'b3']);

		takeTurn(game, 'Alice clues green to Donald');
		takeTurn(game, 'Bob clues red to Cathy');

		// After Bob doesn't play, both b1 and y3 should be known.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['y3']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.DONALD][3]], ['b1']);
	});

	it(`recognizes a potential self fake finesse after a skipped finesse`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['p4', 'r1', 'g4', 'g4'],
			['p4', 'b2', 'b3', 'y4'],
			['r1', 'y2', 'r4', 'g5']
		], {
			level: { min: 5 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 5 to Donald');
		takeTurn(game, 'Cathy clues red to Bob');
		takeTurn(game, 'Donald discards r4', 'r5');

		assert.equal(game.common.waiting_connections.some(conn =>
			conn.connections[0]?.reacting == PLAYER.ALICE &&
			conn.connections[0].order == game.state.hands[PLAYER.ALICE][0]), true);

		takeTurn(game, 'Alice discards y2 (slot 4)');

		assert.equal(game.common.waiting_connections.length, 0);
	});

	it('can interpret a delayed play through possible rainbow identities', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g2', 'r1', 'b2', 'y3'],
			['r2', 'y4', 'b3', 'r3'],
			['m4', 'm2', 'r4', 'g1']
		], {
			level: { min: 5 },
			play_stacks: [0, 0, 0, 0, 1],
			variant: VARIANTS.RAINBOW
		});

		takeTurn(game, 'Alice clues 2 to Donald');		// getting m2
		takeTurn(game, 'Bob clues green to Donald');	// getting g1 (with note [g1, m3])
		takeTurn(game, 'Cathy clues green to Bob');		// getting g2

		// Alice's slot 1 should not be finessed for g1.
		const a_slot1 = game.state.hands[PLAYER.ALICE][0];
		assert.equal(game.common.thoughts[a_slot1].status, undefined);
	});

	it(`correctly recognizes uncertain finessed cards`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'y4', 'g4', 'b4'],
			['r4', 'y4', 'g4', 'b4'],
			['r4', 'g5', 'p4', 'p4']
		], {
			level: { min: 5 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 2 to Alice (slot 2)');

		// Bob might be finessed for r1.
		assert.equal(game.common.waiting_connections.some(conn =>
			conn.connections[0]?.reacting == PLAYER.BOB &&
			conn.connections[0].order == game.state.hands[PLAYER.BOB][0]), true);

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].uncertain, true);
	});

	it(`correctly recognizes certainly finessed cards`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'r2', 'g4', 'b4'],
			['r4', 'y4', 'g4', 'b4'],
			['r4', 'g5', 'p4', 'p4']
		], {
			level: { min: 5 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 3 to Alice (slots 1,2,3,4)');

		// Bob must be finessed for r1.
		assert.equal(game.common.waiting_connections.some(conn =>
			conn.connections[0]?.reacting == PLAYER.BOB &&
			conn.connections[0].order == game.state.hands[PLAYER.BOB][0]), true);

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].uncertain, false);
	});
});

describe('hidden prompts', () => {
	it('cancels a prompt after the reacting player stalls', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['p5', 'y4', 'p4', 'p2', 'g3'],
			['b4', 'y2', 'y1', 'b3', 'r2']
		], {
			level: { min: 5 },
			play_stacks: [1, 0, 0, 0, 0],
			clue_tokens: 4,
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 2 to Cathy');					// Touching r2, y2
		takeTurn(game, 'Cathy clues yellow to Alice (slots 4,5)');
		takeTurn(game, 'Alice plays y1 (slot 5)');

		takeTurn(game, 'Bob clues 3 to Alice (slots 1,5)');

		// Most likely r3 (hidden prompt)
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r3']);

		takeTurn(game, 'Cathy clues 5 to Bob');

		// After Cathy stalls, Alice's slot 2 should be finessed.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, CARD_STATUS.FINESSED);
	});
});

describe('guide principle', () => {
	it('does not give a finesse leaving a critical on chop', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r2', 'g4', 'p2', 'b4'],
			['r4', 'r3', 'b3', 'y3', 'b5']
		], { level: { min: 5 } });

		// Giving 3 to Cathy should be unsafe since b5 will be discarded.
		assert.equal(clue_safe(game, game.me, { type: CLUE.RANK, value: 3, target: PLAYER.CATHY }).safe, false);
	});

	it('gives high value finesses while finessed', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r2', 'g2', 'g3', 'p4'],
			['p1', 'b2', 'p3', 'y4'],
			['p2', 'y2', 'b3', 'r4']
		], {
			level: { min: 5, max: 10 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues blue to Cathy');

		const action = await game.take_action();
		assert(action.type == ACTION.COLOUR || action.type == ACTION.RANK, `Expected purple/4 to Bob, got ${logPerformAction(game, action)}.`);
		if (action.type == ACTION.COLOUR)
			ExAsserts.objHasProperties(action, { type: ACTION.COLOUR, target: 1, value: 5 });
		else
			ExAsserts.objHasProperties(action, { type: ACTION.RANK, target: 1, value: 4 });
	});

	it('does not expect a play when it could be deferring playing into a finesse', () => {
		// From https://github.com/WillFlame14/hanabi-bot/pull/224#issuecomment-2118885427
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'], // g1, b4, p2, p1
			['p4', 'g1', 'g3', 'p5'],
			['b1', 'b2', 'p1', 'y4'],
			['b3', 'y2', 'b3', 'r5']
		], { level: { min: 5 }, starting: PLAYER.CATHY, play_stacks: [0, 0, 0, 0, 3] });
		takeTurn(game, 'Cathy clues 5 to Donald');
		takeTurn(game, 'Donald clues green to Bob');

		// 4 to Bob is not a safe clue, since Bob may see it as a b4 finesse, and
		// may be waiting on Alice to not play their g1.
		const clue = { target: PLAYER.BOB, type: CLUE.RANK, value: 4 };
		assert.equal(clue_safe(game, game.players[PLAYER.ALICE], clue).safe, false);
	});

	it(`gives a critical save even when it is finessed`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['p4', 'g2', 'g4', 'p5'],
			['p4', 'b2', 'b3', 'y4'],
			['b4', 'y2', 'b3', 'r4']
		], {
			level: { min: 5, max: 10 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues blue to Cathy');
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.RANK, target: 1, value: 5 });
	});

	it(`understands a critical save while finessed when other potential givers are finessed`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['p1', 'p2', 'p3', 'g3'],
			['p4', 'y5', 'b3', 'p5'],
			['b4', 'y2', 'p4', 'r4']
		], {
			level: { min: 5 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues purple to Donald'); // finesses p1, p2, p3
		takeTurn(game, 'Donald clues blue to Cathy'); // finesses b1, b2 in our hand
		takeTurn(game, 'Alice clues 5 to Cathy');

		// Understands that Alice may have been deferring the finesse to save the 5 and allow Bob to play.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['b1']);
	});

	it(`understands a critical save where other players only have a play if we play`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b1', 'p2', 'g4', 'g3'],
			['y4', 'y5', 'p3', 'b5'],
			['b4', 'y2', 'p4', 'r4']
		], {
			level: { min: 5 },
			clue_tokens: 7,
			starting: PLAYER.DONALD,
			init: (game) => {
				// TODO: The 5 save should still be urgent without ending the early game in case Cathy has nothing else to do.
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Donald clues purple to Cathy'); // finesses p1 (Alice), b1 (Bob), p2 (Bob)

		// Bob may think playing gives Cathy a play, but Alice can see that it doesn't,
		// and should save Cathy's 5.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.RANK, target: 2, value: 5 }, `Expected (5 to Cathy), got ${logPerformAction(game, action)}`);
		takeTurn(game, 'Alice clues 5 to Cathy');

		// Understands that Alice may have been deferring the finesse to save the 5 and allow Bob to play.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['p1']);
	});

	it(`plays rather than saves if it believes a save will become playable`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['p2', 'b4', 'g4', 'g3'],
			['y4', 'y5', 'p3', 'b5'],
			['b4', 'y2', 'p4', 'r4']
		], {
			level: { min: 5 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues purple to Cathy'); // finesses p1 (Alice), b1 (Bob), p2 (Bob)

		// Bob plays rather than saving Cathy's b5 since the play should make the p3 playable.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] });
	});

	it(`understands a finesse on top of an in progress connection`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['p4', 'r3', 'g3', 'b3'],
			['p1', 'r3', 'p1', 'y2'],
			['b2', 'y3', 'r4', 'b5']
		], {
			level: { min: 5 },
			play_stacks: [1, 1, 1, 1, 0]
		});

		takeTurn(game, 'Alice clues 3 to Bob'); // Finesses b2 -> b3.
		takeTurn(game, 'Bob clues 5 to Donald'); // 5 save.
		takeTurn(game, 'Cathy clues 5 to Donald'); // Should finesse b4 out of Alice's hand.

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['b4']);
	});

	it(`understands a finesse on top of an in progress connection on us`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['p1', 'r3', 'p1', 'y2'],
			['b2', 'y3', 'r4', 'b5'],
			['y2', 'b4', 'b3', 'g4'],
		], {
			level: { min: 5 },
			starting: PLAYER.DONALD,
			play_stacks: [1, 1, 1, 1, 0]
		});

		takeTurn(game, 'Donald clues 3 to Alice (slots 2,3,4)'); // Finesses b2 -> b3.
		takeTurn(game, 'Alice clues 5 to Cathy'); // 5 save.
		takeTurn(game, 'Bob clues 5 to Cathy'); // Should finesse y2, b4 out of Donald's hand.

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.DONALD][0]].status, CARD_STATUS.FINESSED);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.DONALD][1]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.DONALD][1]], ['b4']);
	});

	it(`understands a layered finesse player will not play if their promised card is unplayable`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['p2', 'p3', 'g4', 'g3'],
			['y1', 'p4', 'b5', 'r3'],
			['b4', 'y5', 'p5', 'r4'],
			['y3', 'r1', 'r3', 'g4']
		], {
			level: { min: 5 },
			starting: PLAYER.EMILY,
			init: (game) => {
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Emily clues purple to Donald'); // finesses p1 (Alice), p2 (Bob), p3 (Bob), y1 (Cathy), p4 (Cathy)

		// Alice doesn't need to save Donald's 5, since Cathy will not play on her turn (this action isn't urgent).
		takeTurn(game, 'Alice clues 5 to Donald');

		const last_action = game.last_actions[PLAYER.ALICE];
		// @ts-ignore
		assert.ok(!last_action.important);
	});

	it('recognizes when a clue will be given during early game when playing into a finesse', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g1', 'g2', 'p1', 'r5'],
			['r4', 'y1', 'r1', 'g2'],
			['y1', 'r2', 'p4', 'g4']
		], {
			level: { min: 5 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues green to Cathy');		// finessing g1 on us
		takeTurn(game, 'Cathy clues yellow to Donald');
		takeTurn(game, 'Donald plays y1', 'y3');

		// Alice should play g1, Bob will clue Cathy's r1.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] });
	});
});

describe('prompts in multi-colour variants', () => {
	it(`doesn't give wrong prompts`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['b3', 'm3', 'r1', 'r3'],
			['g4', 'g2', 'b3', 'm5'],
			['b1', 'y2', 'r3', 'r4']
		], {
			level: { min: 2 },
			play_stacks: [0, 0, 0, 2, 0],
			starting: PLAYER.DONALD,
			variant: VARIANTS.RAINBOW
		});

		takeTurn(game, 'Donald clues blue to Bob');
		takeTurn(game, 'Alice clues 5 to Cathy');
		takeTurn(game, 'Bob plays b3', 'r2');

		takeTurn(game, 'Cathy discards b3', 'b5');
		takeTurn(game, 'Donald discards r4', 'b1');

		const { play_clues } = find_clues(game);

		// 2 to Bob is not a valid clue (m3 will bomb as prompt into m2).
		assert.ok(!play_clues[PLAYER.BOB].some(clue => clue.type === CLUE.RANK && clue.value === 2));
	});
});

describe('mistake recovery', () => {
	it('should cancel an ambiguous self-finesse if a missed finesse is directly clued', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['g2', 'p4', 'y2', 'b5'],
			['g3', 'b2', 'y1', 'r5'],
			['r3', 'r1', 'g4', 'b1']
		], {
			level: { min: 2 },
			starting: PLAYER.DONALD
		});

		takeTurn(game, 'Donald clues 3 to Cathy');
		takeTurn(game, 'Alice plays g1 (slot 1)');
		takeTurn(game, 'Bob clues 5 to Alice (slot 4)');

		// Alice should interpret g2 as an ambiguous finesse.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['g2']);

		// Assume Cathy knows she doesn't have g2 because Alice has the other copy, just not in slot 2.
		takeTurn(game, 'Cathy clues 2 to Bob');

		// Alice should cancel ambiguous g2 in slot 2.
		// Note that this is not common since Bob is unaware of what happened.
		assert.ok(game.players[PLAYER.ALICE].thoughts[game.state.hands[PLAYER.ALICE][1]].inferred.length > 1);
		assert.equal(game.players[PLAYER.ALICE].thoughts[game.state.hands[PLAYER.ALICE][1]].status, undefined);
	});
});
