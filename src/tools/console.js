import * as readline from 'readline';
import { ACTION } from '../constants.js';
import { Bot } from '../command-handler.ts';

import logger from './logger.js';
import { logHand, logLinks } from './log.js';
import { Game } from '../basics/Game.js';

/**
 * @param {Game} game
 * @param {string[]} parts
 */
function debug_hand(game, parts) {
	if (parts.length < 2 || parts.length > 3) {
		logger.warn('Correct usage is "hand <playerName> [<playerIndex>]"');
		return;
	}

	const { state } = game;
	const playerName = parts[1];

	if (!game.state.playerNames.includes(playerName)) {
		logger.error('That player is not in this room.');
		console.log(state.playerNames, playerName);
		return;
	}

	const playerIndex = state.playerNames.indexOf(playerName);
	const player = !isNaN(Number(parts[2])) ? game.players[Number(parts[2])] : undefined;
	console.log('viewing from', player === undefined ? 'common' : state.playerNames[player.playerIndex]);
	console.log(logHand(state.hands[playerIndex], player ?? game.common), logLinks(game.players[playerIndex].links));
}

/**
 * @param {Game} game
 * @param {string[]} parts
 */
function navigate(game, parts) {
	if (parts.length !== 2) {
		logger.warn('Correct usage is "navigate <turn>"');
		return;
	}

	if (game.in_progress) {
		logger.warn('Cannot navigate while game is in progress.');
		return;
	}

	const { state } = game;

	const turn = parts[1] === '+' ? state.turn_count + 1 :
				parts[1] === '++' ? state.turn_count + state.numPlayers :
				parts[1] === '-' ? state.turn_count - 1 :
				parts[1] === '--' ? state.turn_count - state.numPlayers :
					Number(parts[1]);

	if (isNaN(turn)) {
		logger.warn('Please provide a valid turn number.');
		return;
	}

	const maxTurn = state.actionList.reduce((max, list) => {
		const action = list.at(-1);
		return Math.max(max, action.type === 'turn' ? action.num + 2 : -1);
	}, 0);

	if (turn < 1 || turn > maxTurn) {
		logger.error(`Turn ${turn} does not exist.`);
		return;
	}

	return game.navigate(turn);
}

/**
 * Initializes the console interactivity with the game state.
 * @param {Bot} bot
 */
export function initConsole(bot) {
	readline.emitKeypressEvents(process.stdin);
	if (process.stdin.isTTY)
		process.stdin.setRawMode(true);

	let command = [];

	process.stdin.on('keypress', (_, key) => {
		if (key.ctrl && key.name === 'c')
			process.exit();

		if (key.sequence === '\x7F')
			key.sequence = '\b';

		process.stdout.write(key.sequence);
		switch(key.sequence) {
			case '\r':
			case '\n': {
				logger.info();
				const parts = command.join('').split(' ');

				const { game, tableID } = bot;

				if (game === undefined) {
					switch (parts[0]) {
						case 'spectate':
							if (parts.length < 2) {
								logger.warn('Correct usage is "spectate <tableID> [shadowingPlayerIndex=-1]"');
								break;
							}

							if (parts.length === 3 && isNaN(Number(parts[2])))
								logger.warn('Please provide a valid shadowing player index.');

							bot.sendCmd('tableSpectate', { tableID: Number(parts[1]), shadowingPlayerIndex: Number(parts[2] ?? -1) });
							break;
						default:
							logger.error('No game specified. Try loading a replay or joining a game first.');
					}
					return;
				}

				const { state } = game;

				switch(parts[0]) {
					case 'hand': {
						debug_hand(game, parts);
						break;
					}
					case 'state':
						console.log(state[parts[1]]);
						break;
					case 'navigate':
					case 'nav': {
						bot.game = navigate(game, parts);
						break;
					}
					case 'unattend':
						bot.sendCmd('tableUnattend', { tableID });
						break;
					case 'chat':
						bot.handle_chat({ msg: parts[1], who: bot.self.username, room: `table`, recipient: bot.self.username });
						break;
					case 'play': {
						const slot = Number(parts[1]);

						if (state.ourHand[slot - 1] === undefined) {
							logger.warn('Invalid slot', slot - 1, 'provided');
							break;
						}

						bot.sendCmd('action', { tableID, type: ACTION.PLAY, target: state.ourHand[slot - 1] });
						break;
					}
					case 'discard': {
						const slot = Number(parts[1]);

						if (state.ourHand[slot - 1] === undefined) {
							logger.warn('Invalid slot', slot - 1, 'provided');
							break;
						}

						bot.sendCmd('action', { tableID, type: ACTION.DISCARD, target: state.ourHand[slot - 1] });
						break;
					}
					case 'clue': {
						const target = state.playerNames.findIndex(p => p === parts[1]);
						const type = parts[2] === 'rank' ? ACTION.RANK : ACTION.COLOUR;
						const value = Number(parts[3]);
						bot.sendCmd('action', { tableID, type, target, value });
						break;
					}
					default:
						logger.warn('Command not recognized.');
				}
				command = [];
				break;
			}
			case '\b':
				command = command.slice(0, -1);
				break;
			default:
				command.push(key.sequence);
				break;
		}
	});
}

/**
 * Initializes the console interactivity with the game state.
 * @param {{ game: Game }} bot
 */
export function initBaseConsole(bot) {
	readline.emitKeypressEvents(process.stdin);
	if (process.stdin.isTTY)
		process.stdin.setRawMode(true);

	let command = [];

	process.stdin.on('keypress', (_, key) => {
		if (key.ctrl && key.name === 'c')
			process.exit();

		if (key.sequence === '\x7F')
			key.sequence = '\b';

		process.stdout.write(key.sequence);
		switch(key.sequence) {
			case '\r':
			case '\n': {
				logger.info();
				const parts = command.join('').split(' ');

				const { game } = bot;

				switch(parts[0]) {
					case 'hand': {
						debug_hand(game, parts);
						break;
					}
					case 'state':
						console.log(game.state[parts[1]]);
						break;
					case 'navigate':
					case 'nav': {
						bot.game = navigate(game, parts);
						break;
					}
					default:
						logger.warn('Command not recognized.');
				}
				command = [];
				break;
			}
			case '\b':
				command = command.slice(0, -1);
				break;
			default:
				command.push(key.sequence);
				break;
		}
	});
}
