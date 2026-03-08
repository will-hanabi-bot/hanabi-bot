import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { COLOUR, PLAYER, setup, takeTurn } from '../test-utils.js';
import * as ExAsserts from '../extra-asserts.js';
import HGroup from '../../src/conventions/h-group.js';
import { CARD_STATUS } from '../../src/basics/Card.js';

import logger from '../../src/tools/logger.js';
import { ACTION, CLUE } from '../../src/constants.js';
import { find_clues } from '../../src/conventions/h-group/clue-finder/clue-finder.js';
import { determine_playable_card } from '../../src/conventions/h-group/action-helper.js';
import { find_urgent_actions } from '../../src/conventions/h-group/urgent-actions.js';
import { ACTION_PRIORITY } from '../../src/conventions/h-group/h-constants.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('giving trash order chop move', () => {
	it('will find a tocm to the next player', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'r4', 'g4', 'r3', 'r5']
		], {
			play_stacks: [1, 1, 1, 1, 1],
			level: { min: 14 },
			starting: PLAYER.BOB
		});

		// With all 1's already played, the clue saves the last 2 cards
		// and gives Alice two trash cards.
		takeTurn(game, 'Bob clues 1 to Alice (slots 2,3)');

		const { state } = game;
		const our_hand = state.ourHand;

		const playable_priorities = determine_playable_card(game, game.me.thinksPlayables(state, PLAYER.ALICE));
		const { play_clues, save_clues, fix_clues, stall_clues } = find_clues(game);
		const urgent_actions = find_urgent_actions(game, play_clues, save_clues, fix_clues, stall_clues, playable_priorities);

		// Alice can save the 5 by discarding out of order.
		ExAsserts.objHasProperties(urgent_actions[ACTION_PRIORITY.ONLY_SAVE][0], { type: ACTION.DISCARD, target: our_hand[2] });
	});

	it('will find a tocm to cathy', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g3', 'r3', 'y3', 'y4', 'g4'],
			['r4', 'r4', 'g4', 'r3', 'r5'],
		], {
			play_stacks: [0, 5, 0, 0, 0],
			level: { min: 14 },
			starting: PLAYER.BOB
		});

		// With all yellow's played, the clue saves slot 5,
		// and gives Alice three trash cards.
		takeTurn(game, 'Bob clues yellow to Alice (slots 2,3,4)');

		const { state } = game;
		const our_hand = state.hands[PLAYER.ALICE];

		const playable_priorities = determine_playable_card(game, [our_hand[1], our_hand[2], our_hand[3]]);
		const { play_clues, save_clues, fix_clues, stall_clues } = find_clues(game);
		const urgent_actions = find_urgent_actions(game, play_clues, save_clues, fix_clues, stall_clues, playable_priorities);

		ExAsserts.objHasProperties(urgent_actions[ACTION_PRIORITY.ONLY_SAVE + Object.keys(ACTION_PRIORITY).length][0], { type: ACTION.DISCARD, target: our_hand[3] });
	});

});

describe('interpreting touch order chop move', () => {
	it('will interpret a tocm to the next player', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b1', 'g1', 'r1', 'r5'],
			['y4', 'r4', 'g4', 'r4', 'b5']
		], {
			level: { min: 14 },
			play_stacks: [1, 1, 1, 1, 1],
		});

		takeTurn(game, 'Alice clues 1 to Bob');
		takeTurn(game, 'Bob discards g1', 'r1');

		// Cathy's slot 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].status, CARD_STATUS.CM);
	});
	it('will interpret a tocm skipping a player', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b1', 'g1', 'r1', 'r5'],
			['y4', 'r4', 'g4', 'r4', 'b5']
		], {
			level: { min: 14 },
			starting: PLAYER.ALICE,
			play_stacks: [1, 1, 1, 1, 1],
		});

		takeTurn(game, 'Alice clues 1 to Bob');
		takeTurn(game, 'Bob discards r1', 'r1');		// OCM on Alice

		// Alice's slot 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);
	});
});

describe('interpreting shout discard order chop move', () => {
	it('will interpret a sdocm to the next player', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b1', 'g1', 'r1', 'r5'],
			['y4', 'r4', 'g4', 'r4', 'b5']
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 1, 1, 1],
		});
		takeTurn(game, 'Alice clues 1 to Bob');
		takeTurn(game, 'Bob discards b1', 'r1');

		// Cathy's slot 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].status, CARD_STATUS.CM);
	});

	it('will interpret a sdocm to the player after next', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['b4', 'b1', 'g1', 'r1', 'r5'],
			['y4', 'r4', 'g4', 'r4', 'b3']
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 1, 1, 1],
		});
		takeTurn(game, 'Alice clues 1 to Bob');
		takeTurn(game, 'Bob discards g1', 'r1');

		// Alice's slot 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);
	});
});

describe('interpreting trash push', () => {
	it('will interpret a trash push', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r2', 'r2', 'b1', 'g1', 'r1'],
		], {
			level: { min: 14 },
			play_stacks: [1, 1, 1, 1, 1],
		});
		takeTurn(game, 'Alice clues 1 to Bob');

		// Bob's slot 2 should be finessed.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][1]].status, CARD_STATUS.FINESSED);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][1]], ['r2', 'g2', 'b2', 'y2', 'p2']);
	});

	it('will interpret a receiving a trash push', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'g3', 'b5', 'b4', 'y3'],
		], {
			level: { min: 14 },
			play_stacks: [5, 1, 3, 2, 1],
			starting: PLAYER.BOB
		});
		takeTurn(game, 'Bob clues 1 to Alice (slots 3,4,5)');

		// Bob's slot 4 should be finessed.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, CARD_STATUS.FINESSED);
	});
});

describe('interpreting trash finesse', () => {
	it('will interpret a rank trash finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'p3', 'b4', 'g4', 'g1'],
			['y5', 'g2', 'g1', 'p2', 'b3'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 2, 0, 0],
		});
		takeTurn(game, 'Alice clues 1 to Cathy');

		// Bob's slot 1 should be blind played.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].blind_playing, true);
		// Cathy's slot 4 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]].status, CARD_STATUS.CM);
	});

	it('will interpret a colour trash finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'p3', 'b4', 'g4', 'g1'],
			['y1', 'g2', 'y5', 'p2', 'b3'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 4, 0, 0],
		});
		// The clue looks like Alice is telling Cathy to play g5.
		// If Bob plays slot 1, it will prove that Alice's clued card was in fact trash, and
		// saves several useful cards in cathy's hand.
		takeTurn(game, 'Alice clues green to Cathy');

		// Bob's slot 1 should be blind played.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].blind_playing, true);
		// Cathy's slot 4 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]].status, CARD_STATUS.CM);
	});

	it('will interpret an ambiguous rank direct play', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'p3', 'b4', 'g4', 'g1'],
			['y5', 'g2', 'b1', 'p2', 'b3'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 2, 0, 0],
		});
		takeTurn(game, 'Alice clues 1 to Cathy');
		takeTurn(game, 'Bob discards g1', 'p3');

		// Cathy's slot 3 should be assumed playable.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][2]], ['r1', 'b1', 'p1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]].status, undefined);
	});

	it('will interpret an ambiguous colour direct play', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'p3', 'b4', 'g4', 'g1'],
			['y5', 'g5', 'b1', 'p2', 'b3'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 4, 0, 0],
		});
		takeTurn(game, 'Alice clues green to Cathy');
		takeTurn(game, 'Bob discards g1', 'p3');

		// Cathy's slot 2 should be assumed playable.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['g5']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]].status, undefined);
	});

	it('will interpret a reverse rank trash finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y5', 'g2', 'g1', 'p2', 'b3'],
			['r1', 'p3', 'b4', 'g4', 'g1'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 2, 1, 1],
		});
		takeTurn(game, 'Alice clues 1 to Bob');

		// Cathy's slot 1 should be finessed.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.FINESSED);
		// Bob's slots 4 and 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][4]].status, CARD_STATUS.CM);
	});

	it('will interpret a reverse colour trash finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y5', 'b1', 'g2', 'p2', 'b3'],
			['g5', 'p3', 'b4', 'g4', 'g1'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 4, 1, 1],
		});
		takeTurn(game, 'Alice clues green to Bob');

		// Cathy's slot 1 should be finessed.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.FINESSED);
		// Bob's slots 4 and 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][4]].status, CARD_STATUS.CM);
	});

	it('will interpret receiving a rank trash finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y5', 'g2', 'g4', 'p2', 'g1'],
			['r1', 'p3', 'b4', 'g4', 'b3'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 2, 0, 0],
			starting: PLAYER.BOB,
		});
		takeTurn(game, 'Bob clues 1 to Alice (slot 3)');

		// Cathy's slot 1 should be blind played.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);
		// Alice's slot 4 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);
	});

	it('will interpret receiving a colour trash finesse', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y5', 'g2', 'p4', 'p2', 'g1'],
			['g5', 'p3', 'b4', 'g4', 'b3'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 4, 0, 0],
			starting: PLAYER.BOB,
		});
		takeTurn(game, 'Bob clues green to Alice (slot 3)');

		// Cathy's slot 1 should be blind played.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.FINESSED);
		// Alice's slots 4 and 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);
	});

	it('will interpret receiving a colour trash bluff', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y5', 'g2', 'p4', 'p2', 'g1'],
			['r1', 'p3', 'b4', 'g4', 'b3'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 4, 0, 0],
			starting: PLAYER.BOB,
		});
		takeTurn(game, 'Bob clues green to Alice (slot 3)');

		// Cathy's slot 1 should be blind played.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);
		// Alice's slots 4 and 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);

		takeTurn(game, 'Cathy plays r1', 'b5');

		// Alice's slot 2 must be known trash.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['g1', 'g2', 'g3', 'g4']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);
	});

	it('will interpret receiving an ambiguous rank direct play', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y5', 'g2', 'g4', 'p2', 'g1'],
			['r1', 'p3', 'b4', 'g4', 'b3'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 2, 0, 0],
			starting: PLAYER.BOB,
		});
		takeTurn(game, 'Bob clues 1 to Alice (slot 3)');

		// Cathy's slot 1 is expected to blind play.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]].status, CARD_STATUS.MAYBE_BLUFFED);
		// Alice's slots 4 and 5 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);

		takeTurn(game, 'Cathy discards g4', 'p3');

		// Alice's slot 3 should be assumed playable.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r1', 'b1', 'p1']);
		// Alice is not chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, undefined);
	});

	it('will interpret receiving a reverse rank trash finesse', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'p3', 'b4', 'g4', 'b3'],
			['y5', 'g2', 'g4', 'p3', 'g1'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 2, 1, 1],
			starting: PLAYER.CATHY,
		});
		// Alice can see that the identity of the promised play matches Bob's r1.
		// She should treat it as a reverse trash finesse and chop move her slots 4 and 5.
		takeTurn(game, 'Cathy clues 1 to Alice (slot 3)');

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r1', 'y1', 'g1', 'b1', 'p1']);

		// Alice should discard her slot 3 to show that the finesse is recognized.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][2] });
		takeTurn(game, 'Alice discards r1 (slot 3)');

		// After the discard, slots 4 and 5 are still chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CM);
	});

	it('will interpret receiving a reverse colour trash finesse', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['g4', 'p3', 'b4', 'g4', 'b3'],
			['y5', 'g2', 'y4', 'p3', 'g1'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 3, 1, 1],
			starting: PLAYER.BOB,
		});
		takeTurn(game, 'Bob clues 5 to Alice (slot 5)');
		// Alice can see that the identity of the promised play matches Bob's g4.
		// She should treat it as a reverse trash finesse and chop move her slot 4.
		takeTurn(game, 'Cathy clues green to Alice (slot 3)');

		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['g1', 'g2', 'g3', 'g4']);

		// Alice should discard her slot 3 to show that the finesse is recognized.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][2] });
		takeTurn(game, 'Alice discards g4 (slot 3)');

		// After the discard, slot 4 is still chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][3]].status, CARD_STATUS.CM);
	});

	it('will interpret receiving a play when an ambiguous reverse rank trash finesse is visible', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'p3', 'b4', 'g4', 'b3'],
			['y5', 'g2', 'g4', 'p3', 'g1'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 2, 0, 0],
			starting: PLAYER.CATHY,
		});
		// This could be a trash finesse on the r1, however Alice can see
		// there are other playable 1s and so should treat it as a straight play.
		takeTurn(game, 'Cathy clues 1 to Alice (slot 3)');

		// Alice's slot 3 should be assumed a playable 1.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]], ['r1', 'b1', 'p1']);
	});

	it('interprets a fill-in trash finesse', async() => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'b4', 'r1', 'b3', 'g4'],
			['y2', 'r1', 'g4', 'b3', 'r5'],
		], {
			level: { min: 14 },
			play_stacks: [3, 0, 0, 0, 0],
			starting: PLAYER.BOB,
		});
		takeTurn(game, 'Bob clues 5 to Cathy');
		takeTurn(game, 'Cathy clues 5 to Alice (slot 5)');

		// This fills in the r5 and clues the r1 as a play.
		takeTurn(game, 'Alice clues red to Cathy');
		// Bob's slot 1 should be blind played.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][0]].blind_playing, true);
		// Cathy's slots 3 and 4 should be chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][2]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]].status, CARD_STATUS.CM);

		takeTurn(game, 'Bob plays r4', 'g2');
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]], ['r1', 'r2', 'r3']);
		// Cathy's slots 3 and 4 remain chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][2]].status, CARD_STATUS.CM);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][3]].status, CARD_STATUS.CM);
	});

	it('interprets receiving a reverse trash finesse', async() => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'b4', 'r1', 'b3', 'g4'],
			['y3', 'g3', 'g4', 'b1', 'r5'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 1, 1, 1],
			starting: PLAYER.BOB,
		});
		takeTurn(game, 'Bob clues 1 to Cathy');
		takeTurn(game, 'Cathy discards b1', 'y3');

		// Alice's slot 1 should be r1 blind playing.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].blind_playing, true);

		// Cathy's slots 5 is chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].status, CARD_STATUS.CM);
		takeTurn(game, 'Alice plays r1 (slot 1)');

		// Cathy is still chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][4]].status, CARD_STATUS.CM);
	});

	it('interprets receiving a trash bluff', async() => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y3', 'g3', 'g4', 'b1', 'r5'],
			['r4', 'b4', 'r1', 'b3', 'g4'],
		], {
			level: { min: 14 },
			play_stacks: [0, 1, 1, 1, 1],
			starting: PLAYER.CATHY,
		});
		takeTurn(game, 'Cathy clues 1 to Bob');

		// Alice's slot 1 should be r1 blind playing.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]], ['r1', 'y2', 'g2', 'b2', 'p2']);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['y1', 'g1', 'b1', 'p1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].blind_playing, true);

		// Bob's slots 5 is chop moved.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][4]].status, CARD_STATUS.CM);
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][0] });
		takeTurn(game, 'Alice plays g2 (slot 1)');

		// Bob is still chop moved.
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.BOB][3]], ['y1', 'g1', 'b1', 'p1']);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][4]].status, CARD_STATUS.CM);
	});
});

describe('giving trash finesses', () => {
	it(`won't give a bad trash finesse`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'p3', 'b4', 'g2', 'b3'],
			['y5', 'g3', 'g4', 'r1', 'b3'],
		], {
			level: { min: 14 },
			play_stacks: [3, 0, 0, 0, 0]
		});
		const { play_clues } = find_clues(game);
		// Red to Cathy is not a valid clue as Cathy will think it is r5.
		assert.ok(!play_clues[PLAYER.CATHY].some(clue => clue.type === CLUE.COLOUR && clue.value === COLOUR.RED));
	});
});
