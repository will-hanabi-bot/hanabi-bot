import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import * as ExAsserts from '../extra-asserts.js';

import { ACTION, CLUE } from '../../src/constants.js';
import { COLOUR, PLAYER, VARIANTS, preClue, setup, takeTurn } from '../test-utils.js';
import HGroup from '../../src/conventions/h-group.js';

import logger from '../../src/tools/logger.js';
import { CLUE_INTERP } from '../../src/conventions/h-group/h-constants.js';
import { CARD_STATUS } from '../../src/basics/Card.js';

logger.setLevel(logger.LEVELS.ERROR);

describe('positional discards', () => {
	it('plays from a positional discard', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'r2', 'r3', 'b1'],
			['b1', 'b2', 'g1', 'r4', 'p1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 4, 4, 4],
			starting: PLAYER.CATHY,
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Cathy discards g1', 'b3');

		// Alice's slot 3 should be called to play from a positional discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].status, CARD_STATUS.CALLED_TO_PLAY);

		// Alice should play slot 3.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][2] });
	});

	it('does not play from a positional discard to someone after them', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'p5', 'r3', 'b1'],
			['b1', 'b2', 'g1', 'r4', 'p1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 4, 4, 4],
			starting: PLAYER.CATHY,
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Cathy discards g1', 'b3');

		// Alice's slot 3 not should be called to play from a positional discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].status, undefined);
	});

	it('does not play from a positional discard if someone before them played into it', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'r2', 'r3', 'b1'],
			['b1', 'b2', 'p5', 'g1', 'p1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 4, 4, 4],
			starting: PLAYER.BOB,
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Bob discards r2', 'g3');

		// Cathy's slot 3 should be called to play from a positional discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][2]].status, CARD_STATUS.CALLED_TO_PLAY);

		takeTurn(game, 'Cathy plays p5', 'b3');

		// Alice's slot 3 should not be called to play from a positional discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].status, undefined);
	});

	it('does not play from a chop discard', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'p5', 'r3', 'b1'],
			['b1', 'b2', 'g1', 'r4', 'p1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 4, 4, 4],
			starting: PLAYER.CATHY,
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Cathy discards p1', 'b3');

		// Alice's slot 5 not should be called to play from a positional discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].status, undefined);
	});

	it('does not play from a normal discard', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'p5', 'r3', 'b1'],
			['b1', 'b2', 'g1', 'r4', 'p1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 4, 4, 4],
			starting: PLAYER.CATHY,
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Cathy discards p1', 'b3');

		// Alice's slot 5 not should be called to play from a positional discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].status, undefined);
	});

	it('plays from a positional discard if someone before them did not play into it', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'r2', 'r3', 'b1'],
			['b1', 'b2', 'p5', 'g1', 'p1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 4, 4, 4],
			starting: PLAYER.BOB,
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Bob discards r2', 'g3');
		takeTurn(game, 'Cathy discards p1', 'b3');

		// Alice's slot 3 should be called to play from a positional discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].status, CARD_STATUS.CALLED_TO_PLAY);
	});

	it('recognizes a positional discard on the correct player', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'b5', 'b1'],
			['b1', 'b2', 'g5', 'g1'],
			['g1', 'g3', 'r3', 'p4'],
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 4, 4, 4],
			starting: PLAYER.DONALD,
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Donald discards r3', 'b3');

		// Cathy's slot 3 should be called to play from a positional discard, while Bob's should not.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][2]].status, CARD_STATUS.CALLED_TO_PLAY);
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.BOB][2]].status, undefined);
	});

	it('performs a positional discard', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'b5', 'b1'],
			['b1', 'b2', 'r2', 'g1'],
			['g1', 'g3', 'r3', 'p4'],
		], {
			level: { min: 8 },
			play_stacks: [5, 5, 5, 4, 5],
			clue_tokens: 0,
			init: (game) => {
				game.state.cardsLeft = 0;
				game.state.endgameTurns = 4;
				game.state.early_game = false;
			}
		});

		const action = await game.take_action();

		// Alice should discard slot 3 as a positional discard.
		ExAsserts.objHasProperties(action, { type: ACTION.DISCARD, target: game.state.hands[PLAYER.ALICE][2] });
	});

	it('plays from a positional discard against common good touch', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx'],
			['y1', 'b1', 'r2', 'i1'],
			['b1', 'r1', 'g1', 'g1'],
			['r1', 'r5', 'i1', 'y1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 5, 5, 5],
			clue_tokens: 2,
			variant: VARIANTS.PINK,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Alice clues 5 to Donald');	// bad touching i1
		takeTurn(game, 'Bob clues red to Donald');
		takeTurn(game, 'Cathy discards r1', 'y2');

		// Alice's slot 2 should be gotten from the positional discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, CARD_STATUS.CALLED_TO_PLAY);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['y5']);

		// Alice should play slot 2.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][1] });
	});

	it(`doesn't consider a missed pos dc if they perform another pos dc`, async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['y1', 'b1', 'r2', 'g1', 'r1'],
			['r5', 'r1', 'y1', 'g1', 'p1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 5, 5, 5],
			clue_tokens: 0,
			starting: PLAYER.BOB,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Bob discards y1', 'b1');
		takeTurn(game, 'Cathy discards r1', 'p1');

		// Alice's slot 2 should be gotten from the positional discard.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]].status, CARD_STATUS.CALLED_TO_PLAY);
		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.ALICE][1]], ['y5']);

		// Cathy's r5 should still be gotten (now in slot 2 after drawing).
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.CATHY][1]].status, CARD_STATUS.CALLED_TO_PLAY);

		// Alice should play slot 2.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][1] });
	});
});

describe('positional misplays', () => {
	it('plays from a positional misplay', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'r5', 'r3', 'b1'],
			['b1', 'b2', 'g1', 'r4', 'p1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 4, 4, 4],
			starting: PLAYER.CATHY,
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Cathy bombs p1', 'b3');

		// Alice's slot 5 should be called to play from a positional misplay.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][4]].status, CARD_STATUS.CALLED_TO_PLAY);

		// Alice should play slot 3.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][4] });
	});

	it('plays from a double positional misplay', async () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r1', 'r1', 'r5', 'r3', 'b1'],
			['b1', 'b2', 'g1', 'r4', 'p1']
		], {
			level: { min: 8 },
			play_stacks: [4, 4, 4, 4, 4],
			starting: PLAYER.CATHY,
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 2;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Cathy bombs g1', 'b3');

		// Alice's slot 3 should be called to play from a positional misplay.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][2]].status, CARD_STATUS.CALLED_TO_PLAY);

		// Alice should play slot 3.
		const action = await game.take_action();
		ExAsserts.objHasProperties(action, { type: ACTION.PLAY, target: game.state.hands[PLAYER.ALICE][2] });
	});
});

describe('mistake discards', () => {
	it('does not bomb from a useless positional discard', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'xx', 'xx', 'xx'],
			['r4', 'y4', 'g4', 'b5', 'b4'],
			['g2', 'b3', 'r5', 'p2', 'p3']
		], {
			level: { min: 8 },
			play_stacks: [4, 5, 5, 4, 5],
			clue_tokens: 1,
			init: (game) => {
				game.state.cardsLeft = 1;
				game.state.early_game = false;
			}
		});

		takeTurn(game, 'Alice clues red to Cathy');
		takeTurn(game, 'Bob discards g4', 'r1');

		// Alice should not attempt to play with no known playables.
		assert.equal(game.common.thoughts[game.state.hands[PLAYER.ALICE][0]].status, undefined);
	});
});

describe('distribution clues', () => {
	it('understands a distribution clue', () => {
		const game = setup(HGroup, [
			['xx', 'xx', 'r5', 'b4', 'b5'],
			['r4', 'r1', 'g4', 'b5', 'b4'],
			['b4', 'b3', 'r5', 'p2', 'p3']
		], {
			level: { min: 8 },
			play_stacks: [4, 5, 5, 3, 5],
			clue_tokens: 1,
			init: (game) => {
				// Alice knows about r5, b5 and b5 in her last 3 slots.
				preClue(game, game.state.hands[PLAYER.ALICE][2], [
					{ type: CLUE.COLOUR, value: COLOUR.RED, giver: PLAYER.BOB },
					{ type: CLUE.RANK, value: 5, giver: PLAYER.CATHY }]);

				preClue(game, game.state.hands[PLAYER.ALICE][3], [
					{ type: CLUE.COLOUR, value: COLOUR.BLUE, giver: PLAYER.BOB },
					{ type: CLUE.RANK, value: 4, giver: PLAYER.CATHY }]);

				preClue(game, game.state.hands[PLAYER.ALICE][4], [
					{ type: CLUE.COLOUR, value: COLOUR.BLUE, giver: PLAYER.BOB },
					{ type: CLUE.RANK, value: 5, giver: PLAYER.CATHY }]);

				game.state.early_game = false;
			},
			starting: PLAYER.BOB
		});

		takeTurn(game, 'Bob clues 4 to Cathy');

		ExAsserts.cardHasInferences(game.common.thoughts[game.state.hands[PLAYER.CATHY][0]], ['b4']);
		assert.equal(game.lastMove, CLUE_INTERP.DISTRIBUTION);
	});
});
