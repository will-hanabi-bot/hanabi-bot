import { find_all_clues as h_find, find_all_discards as h_dc } from './conventions/h-group/take-action.js';
import { find_all_clues as rs_find, find_all_discards as rs_dc } from './conventions/ref-sieve/take-action.js';

export const MAX_H_LEVEL = 14;
export const BOT_VERSION = '1.10.1';

export const ACTION =  /** @type {const} */ ({
	PLAY: 0,
	DISCARD: 1,
	COLOUR: 2,
	RANK: 3,
	END_GAME: 4
});

export const CLUE = /** @type {const} */ ({ COLOUR: 0, RANK: 1 });

export const END_CONDITION = /** @type {const} */ ({
	IN_PROGRESS: 0,
	NORMAL: 1,
	STRIKEOUT: 2,
	TIMEOUT: 3,
	TERMINATED: 4,
	SPEEDRUN_FAIL: 5,
	IDLE_TIMEOUT: 6,
	CHARACTER_SOFTLOCK: 7,
	ALL_OR_NOTHING_FAIL: 8,
	ALL_OR_NOTHING_SOFTLOCK: 9,
	TERMINATED_BY_VOTE: 10
});

export const HAND_SIZE = [-1, -1, 5, 5, 4, 4, 3];

export const ENDGAME_SOLVING_FUNCS = {
	HGroup: {
		find_clues: h_find,
		find_discards: h_dc
	},
	RefSieve: {
		find_clues: rs_find,
		find_discards: rs_dc
	}
};

export const HANABI_HOSTNAME = process.env['HANABI_HOSTNAME'] || 'hanab.live';
