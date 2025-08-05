 import { ACTION, CLUE } from '../constants.js';

export type Identity = {
	suitIndex: number,
	rank: number
};

export type BaseClue = {
	type: typeof CLUE[keyof typeof CLUE],
	value: number
};

export type StatusAction = {
	type: 'status',
	clues: number,
	score: number,
	maxScore: number
};

export type TurnAction = {
	type: 'turn',
	num: number,
	currentPlayerIndex: number
};

export type ClueAction = {
	type: 'clue',
	giver: number,
	target: number,
	list: number[],
	clue: BaseClue,
	mistake?: boolean,
	lock?: boolean,
	important?: boolean,
	hypothetical?: boolean,
	noRecurse?: boolean
};

export type CardAction = {
	order: number,
	playerIndex: number,
	suitIndex: number,
	rank: number
};

export type DrawAction = CardAction & { type: 'draw' };
export type PlayAction = CardAction & { type: 'play' };
export type DiscardAction = CardAction & { type: 'discard', failed: boolean, intentional?: boolean };

export type IdentifyAction = {
	type: 'identify',
	order: number,
	playerIndex: number,
	identities: Identity[],
	infer?: boolean
}

export type IgnoreAction = {
	type: 'ignore',
	conn_index: number,
	order: number,
	inference?: Identity
};

export type FinesseAction = {
	type: 'finesse',
	list: number[],
	clue: BaseClue
};

export type GameOverAction = {
	type: 'gameOver',
	endCondition: number,
	playerIndex: number,
	votes?: number[]
};

export type Action = StatusAction | TurnAction | ClueAction | DrawAction | DiscardAction | PlayAction | GameOverAction | IdentifyAction | IgnoreAction | FinesseAction;

export type PerformAction = {
	type: typeof ACTION[keyof typeof ACTION],
	target: number,
	value?: number
};
