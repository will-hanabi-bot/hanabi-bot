import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { PLAYER, setup, takeTurn } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';
import { ACTION, CLUE } from '../../src/constants.js';
import { ACTION_PRIORITY as PRIORITY } from '../../src/conventions/h-group/h-constants.js';
import { CARD_STATUS } from '../../src/basics/Card.js';
import { find_clues } from '../../src/conventions/h-group/clue-finder/clue-finder.js';
import { determine_playable_card } from '../../src/conventions/h-group/action-helper.js';
import { find_urgent_actions } from '../../src/conventions/h-group/urgent-actions.js';
import { clue_safe } from '../../src/conventions/h-group/clue-finder/clue-safe.js';

import logger from '../../src/tools/logger.js';
import { logPerformAction } from '../../src/tools/log.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('trash chop move', () => {
	it('will give a rank tcm for 1 card', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g4', 'r1', 'b4']
		], {
			level: { min: 4 },
			play_stacks: [2, 2, 2, 2, 2]
		});

		const { save_clues } = find_clues(game);
		ExAsserts.objHasProperties(save_clues[PLAYER.BOB], { type: CLUE.RANK, value: 1 });
	});

	it('will give a rank tcm touching multiple trash cards', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'b1', 'r1', 'b4']
		], {
			level: { min: 4 },
			play_stacks: [2, 2, 2, 2, 2]
		});

		const { save_clues } = find_clues(game);
		ExAsserts.objHasProperties(save_clues[PLAYER.BOB], { type: CLUE.RANK, value: 1 });
	});

	it('will not give a tcm if chop is trash', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'b1', 'b4', 'g2']
		], {
			level: { min: 4 },
			play_stacks: [2, 2, 2, 2, 2]
		});

		const { save_clues } = find_clues(game);
		assert.equal(save_clues[PLAYER.BOB], undefined);
	});

	it('will not give a tcm if chop is a duplicated card', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'b1', 'g4', 'g4']
		], {
			level: { min: 4 },
			play_stacks: [2, 2, 2, 2, 2]
		});

		const { save_clues } = find_clues(game);
		assert.equal(save_clues[PLAYER.BOB], undefined);
	});

	it('will not give a tcm if chop can be saved directly (critical)', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'b1', 'r1', 'g5']
		], {
			level: { min: 4 },
			play_stacks: [2, 2, 2, 2, 2]
		});

		const { save_clues } = find_clues(game);
		ExAsserts.objHasProperties(save_clues[PLAYER.BOB], { type: CLUE.RANK, value: 5 });
	});

	it('will not give a tcm if chop can be saved directly (2 save)', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y4', 'g4', 'b1', 'r1', 'y2']
		], {
			level: { min: 4 },
			play_stacks: [5, 0, 0, 2, 2]
		});

		const { save_clues } = find_clues(game);
		ExAsserts.objHasProperties(save_clues[PLAYER.BOB], { type: CLUE.RANK, value: 2 });
	});

	it('will not give a tcm if a play can be given instead', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y4', 'g4', 'b1', 'r1', 'y2']
		], {
			level: { min: 4 },
			play_stacks: [5, 1, 0, 2, 2]
		});

		const { play_clues, save_clues, fix_clues, stall_clues } = find_clues(game);
		const playable_priorities = determine_playable_card(game, game.me.thinksPlayables(game.state, PLAYER.ALICE));
		const urgent_actions = find_urgent_actions(game, play_clues, save_clues, fix_clues, stall_clues, playable_priorities, undefined);

		assert.deepEqual(urgent_actions[PRIORITY.ONLY_SAVE], []);
		ExAsserts.objHasProperties(urgent_actions[PRIORITY.PLAY_OVER_SAVE][0], { type: ACTION.COLOUR, value: 1 });
	});

	it('will not give unsafe tcms', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g3', 'y4', 'y1', 'r3', 'y3'],
			['r4', 'r4', 'g4', 'b1', 'r5'],
		], {
			level: { min: 4 },
			play_stacks: [1, 1, 1, 1, 1],
			clue_tokens: 1
		});

		const clue = { type: CLUE.RANK, value: 1, target: PLAYER.BOB };
		assert.equal(clue_safe(game, game.me, clue).safe, false);
	});

	it('recognizes a delayed tcm on other', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g3', 'y4', 'y1', 'r3', 'y3'],
			['b4', 'b4', 'g4', 'r1', 'b3'],
		], {
			level: { min: 4 },
			play_stacks: [3, 0, 0, 0, 0],
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues red to Alice (slots 2,3)');
		takeTurn(game, 'Alice plays r4 (slot 2)');
		takeTurn(game, 'Bob clues red to Cathy');

		// Cathy's slot 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].status, CARD_STATUS.CM);
	});

	it('recognizes a delayed tcm on self', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b4', 'g4', 'r5', 'r4'],
			['g3', 'y4', 'y1', 'y5', 'b3'],
		], {
			level: { min: 4 },
			play_stacks: [3, 0, 0, 0, 0]
		});

		takeTurn(game, 'Alice clues red to Bob');
		takeTurn(game, 'Bob plays r4', 'g1');
		takeTurn(game, 'Cathy clues red to Alice (slot 4)');

		// Alice's slot 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);
	});

	it('assumes trash on the tcm focus', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'b4', 'g4', 'r1'],
			['g3', 'y1', 'r4', 'b1'],
			['g1', 'b3', 'y4', 'y5']
		], {
			level: { min: 4 },
			play_stacks: [0, 3, 0, 0, 0],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 5 to Donald');
		takeTurn(game, 'Cathy clues yellow to Donald');
		takeTurn(game, 'Donald clues yellow to Alice (slot 3)');

		// Alice's slot 4 should be chop moved, and slot 3 should not (necessarily) be playable.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thinksPlayables(game.state, PLAYER.ALICE).length, 0);
	});
});

describe(`5's chop move`, () => {
	it(`doesn't interpret a false 5cm`, () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g4', 'r3', 'r5']
		], {
			level: { min: 4 },
			starting: PLAYER.BOB,
			clue_tokens: 5,
			init: (game) => {
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Bob clues 5 to Alice (slots 3,5)');

		// Slot 4 should not be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, undefined);
	});
});

describe('giving order chop move', () => {
	it('will find an ocm to the next player', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g4', 'r3', 'r5']
		], {
			level: { min: 4 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 3,4)');

		const { state } = game;
		const our_hand = state.ourHand;

		const playable_priorities = determine_playable_card(game, game.me.thinksPlayables(state, PLAYER.ALICE));
		const { play_clues, save_clues, fix_clues, stall_clues } = find_clues(game);
		const urgent_actions = find_urgent_actions(game, play_clues, save_clues, fix_clues, stall_clues, playable_priorities);

		ExAsserts.objHasProperties(urgent_actions[PRIORITY.ONLY_SAVE][0], { type: ACTION.PLAY, target: our_hand[2] });
	});

	it('will find an ocm to cathy', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g3', 'r3', 'y3', 'y4', 'y4'],
			['r4', 'r4', 'g4', 'r3', 'r5'],
		], {
			level: { min: 4 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 2,3,4)');

		const { state } = game;
		const our_hand = state.hands[PLAYER.ALICE];

		const playable_priorities = determine_playable_card(game, [our_hand[1], our_hand[2], our_hand[3]]);
		const { play_clues, save_clues, fix_clues, stall_clues } = find_clues(game);
		const urgent_actions = find_urgent_actions(game, play_clues, save_clues, fix_clues, stall_clues, playable_priorities);

		ExAsserts.objHasProperties(urgent_actions[PRIORITY.ONLY_SAVE + Object.keys(PRIORITY).length][0], { type: ACTION.PLAY, target: our_hand[1] });
	});

	it('will not give an ocm putting a critical on chop', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g4', 'p5', 'r5']
		], {
			level: { min: 4 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 3,4)');

		const { save_clues } = find_clues(game);
		ExAsserts.objHasProperties(save_clues[PLAYER.BOB], { type: CLUE.RANK, value: 5 });
	});

	it('will not ocm trash', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g4', 'g4', 'r1']
		], {
			level: { min: 4 },
			play_stacks: [2, 0, 0, 0, 0],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 3,4)');

		// Alice should not OCM the trash r1.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: 1 });
	});

	it('will ocm one card of an unsaved duplicate', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g5', 'g4', 'g4']
		], {
			level: { min: 4 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 3,4)');

		// Alice should OCM 1 copy of g4.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: 2 });
	});

	it('will not ocm one card of a saved duplicate', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g3', 'g3', 'r2'],
			['g4', 'r3', 'y3', 'y3', 'r2']
		], {
			level: { min: 4 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 2 to Cathy');		// 2 Save, r2
		takeTurn(game, 'Cathy clues 1 to Alice (slots 3,4)');

		// Alice should not OCM the copy of r2.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: 1 });
	});

	it('will not ocm a playable card', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g3', 'g3', 'r1'],
			['g5', 'r1', 'y3', 'y3', 'r2']
		], {
			level: { min: 4 },
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 2 to Cathy');		// 2 Save, r2
		takeTurn(game, 'Cathy clues 1 to Alice (slots 3,4)');

		// Alice should not OCM r1.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: 1 }, `Expected (play slot 4), suggested ${logPerformAction(game, action)}`);
	});

	it('plays the last 1 in the correct order when not wanting to ocm', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'b4', 'g4', 'y1', 'p4']
		], {
			level: { min: 3 },
			play_stacks: [1, 1, 1, 0, 0],
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Alice (slots 3,4,5)');
		takeTurn(game, 'Alice plays b1 (slot 5)');
		takeTurn(game, 'Bob discards p4', 'g3');

		const action = await game.take_action();

		// Alice should play the rightmost 1 to avoid OCM'ing y1.
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][4] });
	});
});

describe('interpreting order chop move', () => {
	it('will interpret an ocm to the next player', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b1', 'g1', 'r1', 'r5'],
			['y4', 'r4', 'g4', 'r4', 'b5']
		], { level: { min: 4 } });

		takeTurn(game, 'Alice clues 1 to Bob');
		takeTurn(game, 'Bob plays g1', 'r1');		// OCM on Cathy

		// Cathy's slot 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].status, CARD_STATUS.CM);
	});

	it('will interpret an ocm skipping a player', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b1', 'g1', 'r1', 'r5'],
			['y4', 'r4', 'g4', 'r4', 'b5']
		], {
			level: { min: 4 },
			starting: PLAYER.CATHY
		});

		takeTurn(game, 'Cathy clues 5 to Alice (slot 5)');
		takeTurn(game, 'Alice clues 1 to Bob');
		takeTurn(game, 'Bob plays b1', 'r1');		// OCM on Alice

		// Alice's slot 4 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
	});

	it('will interpret an ocm that bombs', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b1', 'g1', 'r1', 'r5'],
			['y4', 'r4', 'g4', 'r4', 'b5']
		], {
			play_stacks: [0, 0, 1, 0, 0],
			level: { min: 4 }
		});

		takeTurn(game, 'Alice clues 1 to Bob');
		takeTurn(game, 'Bob bombs g1', 'r1');		// OCM on Cathy

		// Cathy's slot 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].status, CARD_STATUS.CM);
	});
});

describe('interpreting chop moves', () => {
	it('will interpret new focus correctly', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b3', 'g3', 'r3', 'r5']
		], {
			level: { min: 4 },
			starting: PLAYER.BOB
		});

		// Alice's slots 4 and 5 are chop moved
		[3, 4].forEach(index => game.common.updateThoughts(game.state.hands[PLAYER.ALICE][index], (draft) => { draft.updateStatus(CARD_STATUS.CM); }));

		takeTurn(game, 'Bob clues purple to Alice (slots 2,5)');

		// Alice's slot 2 should be p1.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['p1']);
	});

	it('will interpret only touching cm cards correctly', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b3', 'g3', 'r3', 'r5']
		], {
			level: { min: 4 },
			starting: PLAYER.BOB
		});

		// Alice's slots 4 and 5 are chop moved
		[3, 4].forEach(index => game.common.updateThoughts(game.state.hands[PLAYER.ALICE][index], (draft) => { draft.updateStatus(CARD_STATUS.CM); }));

		takeTurn(game, 'Bob clues purple to Alice (slots 4,5)');

		// Alice's slot 4 should be p1.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]], ['p1']);
	});

	it('will interpret touching previously cm and clued correctly', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b3', 'g3', 'r3', 'r5']
		], {
			level: { min: 4 },
			starting: PLAYER.BOB
		});

		// Alice's slots 4 and 5 are chop moved
		for (const index of [3,4]) {
			for (const player of game.allPlayers)
				player.updateThoughts(game.state.hands[PLAYER.ALICE][index], (draft) => { draft.updateStatus(CARD_STATUS.CM); });
		}

		takeTurn(game, 'Bob clues purple to Alice (slots 2,3,4,5)');
		takeTurn(game, 'Alice plays p1 (slot 3)');
		takeTurn(game, 'Bob clues purple to Alice (slots 3,4,5)');	// Focus is leftmost, not leftmost previously cm'd

		// Alice's slot 3 should be p2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['p2']);
	});

	it('prioritizes new cards over gt-eliminated chop moved cards', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b1', 'g1', 'r5', 'r2'],
			['y2', 'b2', 'p3', 'y1', 'r4']
		], {
			level: { min: 4 },
			play_stacks: [1, 5, 5, 5, 5],
			discarded: ['r3', 'r4'],
			clue_tokens: 4
		});

		takeTurn(game, 'Alice clues 5 to Bob');				// known r5
		takeTurn(game, 'Bob clues 4 to Cathy');				// r4 save
		takeTurn(game, 'Cathy clues 1 to Alice (slot 4)');	// Trash Chop Move, saving r3 in slot 5
		takeTurn(game, 'Alice discards b1 (slot 4)');		// Alice draws r2 in slot 1 
		takeTurn(game, 'Bob clues red to Cathy');			// Reverse finesse on r4

		// Slot 1 should be red 2.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r2']);

		takeTurn(game, 'Cathy discards y1', 'r1');

		// Alice should play r2.
		const action1 = await game.take_action();
		assert.ok(action1.type === ACTION.PLAY && action1.target === game.state.hands[PLAYER.ALICE][0]);

		takeTurn(game, 'Alice plays r2 (slot 1)');
		takeTurn(game, 'Bob discards r2', 'p2');
		takeTurn(game, 'Cathy discards p3', 'y4');

		// Alice should play r3.
		const action2 = await game.take_action();
		assert.ok(action2.type === ACTION.PLAY && action2.target === game.state.hands[PLAYER.ALICE][1]);
	});

	it('asymmetrically eliminates against chop moved cards', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b1', 'g1', 'r3', 'r2'],
			['p4', 'b2', 'y1', 'p3', 'y4']
		], {
			level: { min: 4 },
			play_stacks: [4, 5, 5, 5, 5],
			clue_tokens: 2,
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 1 to Cathy');		// Chop moving trash
		takeTurn(game, 'Cathy clues red to Alice (slots 2,3)');

		// Alice should have known r5.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['r5']);

		// Alice should play r5 on her turn.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][1] });

		// Cathy shouldn't have any links.
		assert.equal(game.players[PLAYER.CATHY].links.length, 0);
	});
});
