import type { ChatMessage, InitData, NoteListPlayerData, Self, Table } from './types-live.js';

import { Game } from './basics/Game.js';
import { BOT_VERSION, MAX_H_LEVEL } from './constants.js';
import { CONVENTIONS, infoNote, parseSettingsFromNote, settingsString } from './tools/settings.ts';
import type { Settings } from './tools/settings.ts';

import * as Utils from './tools/util.js';
import logger from './tools/logger.js';
import type { Action } from './basics/Action.ts';
import { getVariant } from './variants.js';
import { State } from './basics/State.js';
import { logPerformAction } from './tools/log.js';

// configuration from environment
// two separate flags control bot‑only departure behaviour:
// * pregame – handled while in the table lobby, before the game starts
// * replay  – handled when watching a shared replay
const LEAVE_PREGAME_IF_ONLY_BOTS = (process.env.HANABI_LEAVE_PREGAME_IF_ONLY_BOTS || '') === '1';
const LEAVE_REPLAY_IF_ONLY_BOTS = (process.env.HANABI_LEAVE_REPLAY_IF_ONLY_BOTS || '1') === '1';

// comma-separated list of prefixes which identify bot accounts; empty by default
// e.g. 'will-bot,mybot'. If the list is empty, no names will be treated as bots.
const BOT_NAME_PREFIXES: string[] = (() => {
	const raw = process.env.HANABI_BOT_NAME_PREFIXES || '';
	return raw.split(',').map(p => p.trim()).filter(p => p.length > 0);
})();

function isBotName(name: string): boolean {
	return BOT_NAME_PREFIXES.some(prefix => name.startsWith(prefix));
}

declare type WebSocket = typeof import("undici-types").WebSocket.prototype;

export class Bot {
	game: Game | undefined;
	settings: Settings = { convention: 'HGroup', level: 1 };
	last_sender: string | undefined;
	commander: string | undefined;

	self: Self;
	tableID: number | undefined;
	gameStarted = false;
	restoredLevel = false;

	tables: Map<number, Table> = new Map();
	ws: WebSocket;
	cmdQueue: string[] = [];
	queueTimer: NodeJS.Timeout | undefined;

	manual: boolean;

	constructor(ws: WebSocket, manual: boolean) {
		this.ws = ws;
		this.manual = manual;
	}

	async handle_action(action: Action) {
		this.game = this.game.handle_action(action);

		for (const { cmd, arg } of this.game.queued_cmds) 
			this.sendCmd(cmd, { tableID: this.tableID, ...arg });

		this.game.queued_cmds = [];

		const { state } = this.game;

		const perform = (action.type === 'turn' || (state.turn_count === 1 && action.type === 'draw')) &&
			state.currentPlayerIndex === state.ourPlayerIndex &&
			!this.game.catchup;

		if (perform) {
			const suggested_action = this.game.take_action();

			if (this.game.in_progress) {
				if (!this.manual)
					setTimeout(async () => this.sendCmd('action', { tableID: this.tableID, ...await suggested_action }), this.game.state.options.speedrun ? 0 : 2000);
			}
			// Replaying a turn
			else {
				logger.highlight('cyan', 'Suggested action:', logPerformAction(this.game, await suggested_action));
			}
		}
	}

	async handle_msg(command: string, data: unknown) {
		switch (command) {
			case 'chat':
				this.handle_chat(data as ChatMessage);
				break;

			// Received when an action is taken in the current active game.
			case 'gameAction': {
				const { action } = data as { tableID: number, action: Action };
				this.handle_action(action);
				break;
			}

			// Received at the beginning of the game, as a list of all actions that have happened so far.
			case 'gameActionList': {
				const { list } = data as { tableID: number, list: Action[] };

				if (this.restoredLevel) {
					logger.info(`Catching up with the game with ${settingsString(this.settings)}`);

					this.game.catchup = true;
					for (let i = 0; i < list.length - 1; i++)
						this.handle_action(list[i]);
					this.game.catchup = false;

					this.handle_action(list.at(-1));

					// Send "loaded" to let server know that we have "finished loading the UI"
					this.sendCmd('loaded', { tableID: this.tableID });
				}
				break;
			}

			// Received when successfully joining a table.
			case 'joined': {
				const { tableID } = data as { tableID: number };
				this.tableID = tableID;
				this.gameStarted = false;
				break;
			}

			case 'noteListPlayer': {
				// If the settings have already been restored do nothing.
				if (this.restoredLevel) break;
				const { tableID, notes } = data as NoteListPlayerData;
				logger.info('Parsing level from not', notes[0]);

				// Restore bot level from the note on the first card after rejoin
				if (notes[0]) {
					const levelInfo = parseSettingsFromNote(notes[0]);
					if (levelInfo && (levelInfo.convention !== this.settings.convention || levelInfo.level !== this.settings.level)) {
						logger.info(`Restored bot level from first card note: ${settingsString(levelInfo)}`);
						// Use information from current game to reconstruct initial state
						const { playerNames, ourPlayerIndex, variant, options } = this.game.state;
						const state = new State(playerNames, ourPlayerIndex, variant, options);
						this.settings.convention = levelInfo.convention;
						this.settings.level = levelInfo.level;
						this.game = new CONVENTIONS[this.settings.convention](state, true, undefined, this.settings.level);
						this.sendChat(`Restored settings. Playing with ${settingsString(this.game.settings as Settings)} conventions.`);
					}
				}
				// Ask the server for more info. This time really.
				// This will also resend the 'noteListPlayer' message. But this time we just ignore it.
				this.restoredLevel = true;

				// Write the note with the settings as early as possible.
				// This does not fully protect against the note not being written if the bot crashes before this point.
				if (this.game.notes[0] === undefined && this.game.in_progress) {
					const note = infoNote(this.game.settings as Settings);
					this.game.queued_cmds.push({ cmd: 'note', arg: { order: 0, note } });
					this.game.notes[0] = { last: note, turn: 0, full: note };
				}

				this.sendCmd('getGameInfo2', { tableID });
				break;
			}

			// Received at the beginning of the game, with information about the game.
			case 'init': {
				const { tableID, playerNames, ourPlayerIndex, options } = data as InitData;
				this.tableID = tableID;
				const variant = await getVariant(options.variantName);

				const state = new State(playerNames, ourPlayerIndex, variant, options);

				// Initialize game state using convention set
				this.game = new CONVENTIONS[this.settings.convention](state, true, undefined, this.settings.level);

				Utils.globalModify({ variant, playerNames, cache: new Map() });

				// Ask the server for more info
				// We will receive the 'noteListPlayer' next. This is when we can restore the settings.
				this.restoredLevel = false;
				this.sendCmd('getGameInfo2', { tableID });
				break;
			}

			// Received when leaving a table.
			case 'left':
				this.tableID = undefined;
				this.gameStarted = false;
				break;

			// Received when a table updates its information.
			case 'table': {
				const { id, sharedReplay, spectators, running, players } = data as Table;
				this.tables.set(id, data as Table);

				// Only bots left in the replay
				if (id !== this.tableID) break;

				if (sharedReplay && LEAVE_REPLAY_IF_ONLY_BOTS && spectators.every(({ name }) => isBotName(name))) {
					logger.info('Leaving game. Only bots left spectating');
					this.leaveRoom();
				} else if (!running && LEAVE_PREGAME_IF_ONLY_BOTS && players.every((name) => isBotName(name))) {
					logger.info('Leaving game. Only bots left in lobby');
					this.leaveRoom();
				}
				break;
			}

			// Received when a table is removed.
			case 'tableGone': {
				const { tableID } = data as { tableID: number };
				this.tables.delete(tableID);
				break;
			}

			// Received once, with a list of the current tables and their information.
			case 'tableList': {
				for (const table of data as Table[])
					this.tables.set(table.id, table);

				// Try to automatically re-attend games after crash
				const table = Utils.maxOn(this.tables.values().filter(table => table.players.includes(this.self.username)).toArray(), (table) => table.id);

				logger.info('Trying to re-attend table', table);

				if (table !== undefined)
					this.sendCmd('tableReattend', { tableID: table.id });
				break;
			}

			// Received when the current table starts a game.
			case 'tableStart': {
				const { tableID } = data as { tableID: number };
				this.tableID = tableID;
				this.sendCmd('getGameInfo1', { tableID });
				this.gameStarted = true;
				break;
			}

			// Received when we send an invalid command.
			case 'warning': {
				const { warning } = data as { warning: string };
				if (this.manual || this.last_sender === undefined) {
					logger.error(warning);
				}
				else {
					this.sendPM(this.last_sender, warning);
					this.last_sender = undefined;
				}
				break;
			}

			// Received when we first register a websocket.
			case 'welcome':
				this.self = data as Self;
		}
	}

	handle_chat(data: ChatMessage) {
		const within_room = data.recipient === '' && data.room.startsWith('table');

		if (within_room) {
			if (data.msg.startsWith('/setall'))
				this.assignSettings(data, false);
			else if (data.msg.startsWith('/leaveall'))
				this.leaveRoom();

			return;
		}

		// We only care about private messages to us
		if (data.recipient !== this.self.username)
			return;


		this.last_sender = data.who;

		// Invites the bot to a lobby (format: /join [password])
		if (data.msg.startsWith('/join')) {
			const table = Utils.maxOn(this.tables.values().filter(table =>
				(table.players.includes(data.who) && !table.sharedReplay) ||
				table.spectators.some(spec => spec.name === data.who)
			).toArray(), (table) => table.id);

			if (table === undefined) {
				this.sendPM(data.who, 'Could not join, as you are not in a room.');
				return;
			}

			if (!table.passwordProtected) {
				this.sendCmd('tableJoin', { tableID: table.id });
			}
			else {
				const ind = data.msg.indexOf(' ');
				const password = ind != -1 ? data.msg.slice(ind + 1) : undefined;

				if (password === undefined) {
					this.sendPM(data.who, 'Room is password protected, please provide a password.');
					return;
				}
				this.sendCmd('tableJoin', { tableID: table.id, password });
			}
		}
		// Readds the bot to a game (format: /rejoin)
		else if (data.msg.startsWith('/rejoin')) {
			if (this.tableID !== undefined) {
				this.sendPM(data.who, 'Could not rejoin, as the bot is already in a game.');
				return;
			}

			const table = Utils.maxOn(this.tables.values().filter(table => table.players.includes(this.self.username)).toArray(), (table) => table.id);

			if (table === undefined)
				this.sendPM(data.who, 'Could not rejoin, as the bot is not a player in any currently open room.');
			else 
				this.sendCmd('tableReattend', { tableID: table.id });
		}
		// Kicks the bot from a game (format: /leave)
		else if (data.msg.startsWith('/leave')) {
			if (this.tableID === undefined) {
				this.sendPM(data.who, 'Could not leave, as the bot is not currently in a room.');
				return;
			}

			this.leaveRoom();
		}
		// Creates a new table (format: /create <name> <maxPlayers> <password>)
		else if (data.msg.startsWith('/create')) {
			const parts = data.msg.split(' ');
			this.sendCmd('tableCreate', { name: parts[1], maxPlayers: Number(parts[2]), password: parts[3] });
		}
		// Starts the game (format: /start)
		else if (data.msg.startsWith('/start')) {
			this.sendCmd('tableStart', { tableID: this.tableID });
			this.commander = data.who;
		}
		// Restarts a game (format: /restart)
		else if (data.msg.startsWith('/restart')) {
			this.sendCmd('tableRestart', { tableID: this.tableID, hidePregame: true });
		}
		// Remakes a table (format: /remake)
		else if (data.msg.startsWith('/remake')) {
			this.sendCmd('tableRestart', { tableID: this.tableID, hidePregame: false });
		}
		// Displays or modifies the current settings (format: /settings [convention = 'HGroup'] [level = 1])
		else if (data.msg.startsWith('/settings')) {
			this.assignSettings(data, this.tableID === undefined);
		}
		else if (data.msg.startsWith('/terminate')) {
			if (this.commander !== undefined && data.who !== this.commander) {
				this.sendPM(data.who, `Only ${this.commander} can terminate the game, as they were the one who started it.`);
				return;
			}
			this.sendCmd('tableTerminate', { tableID: this.tableID });
			this.commander = undefined;
		}
		else if (data.msg.startsWith('/version')) {
			this.sendPM(data.who, `v${BOT_VERSION}`);
		}
		else {
			this.sendPM(data.who, 'Unrecognized command.');
		}
	}

	leaveRoom() {
		this.sendCmd(this.gameStarted ? 'tableUnattend' : 'tableLeave', { tableID: this.tableID });
		this.tableID = undefined;
		this.game = undefined;
		this.gameStarted = false;
	}

	assignSettings(data: ChatMessage, priv: boolean) {
		const parts = data.msg.split(' ');

		const reply = priv ?
			(msg: string) => this.sendPM(data.who, msg) :
			(msg: string) => this.sendChat(msg);

		// Viewing settings
		if (parts.length === 1) {
			reply(`Currently playing with ${settingsString(this.settings)} conventions.`);
			return;
		}

		if (this.game?.in_progress) {
			reply('Settings cannot be modified in the middle of a game.');
			return;
		}

		this.settings.level = undefined;
		let level: number | undefined;

		// Allow setting H-Group conventions by only providing level
		if (!isNaN(Number(parts[1]))) {
			this.settings.convention = 'HGroup';
			level = Number(parts[1]);
		}
		else {
			if (!(parts[1] in CONVENTIONS)) {
				reply(`Format is ${priv ? '/settings' : '/setall'} [convention=HGroup] [level=1]. For example, try '${priv ? '/settings' : '/setall'} HGroup 1'.`);
				return;
			}
			this.settings.convention = parts[1] as keyof typeof CONVENTIONS;
		}

		if (this.settings.convention === 'HGroup') {
			level = level ?? (Number(parts[2]) || 1);

			if (level < 1 || level > MAX_H_LEVEL) {
				reply(`This bot can currently only play between levels 1 and ${MAX_H_LEVEL}. Currently set to level ${this.settings.level}.`);
				return;
			}

			if (level > 11) {
				reply(`This bot can currently only play up to level 11 (+ level 13). There is no support for level 12.`);

				if (level < 13)
					level = 11;
			}

			this.settings.level = Math.max(Math.min(level, MAX_H_LEVEL), 1);
		}
		else if (this.settings.convention === 'RefSieve') {
			reply('Note that this bot plays with loaded rank play clues that are right-referential rather than direct (as in the doc).');
		}

		reply(`Currently playing with ${settingsString(this.settings)} conventions.`);
		logger.info(this.settings.convention, this.settings.level);
	}

	/** Sends a private chat message in hanab.live to the recipient. */
	sendPM(recipient: string, msg: string) {
		this.sendCmd('chatPM', { msg, recipient, room: 'lobby' });
	}

	/** Sends a chat message in hanab.live to the room. */
	sendChat(msg: string) {
		this.sendCmd('chat', { msg, room: `table${this.tableID}` });
	}

	/** Sends a game command to hanab.live with an object as data. */
	sendCmd(command: string, arg: unknown) {
		this.cmdQueue.push(command + ' ' + JSON.stringify(arg));

		if (this.queueTimer === undefined)
			this.emptyCmdQueue();
	}

	emptyCmdQueue() {
		if (this.cmdQueue.length === 0) {
			this.queueTimer = undefined;
			return;
		}

		const cmd = this.cmdQueue.shift();
		this.ws.send(cmd);
		logger.debug('sending cmd', cmd);

		this.queueTimer = setTimeout(this.emptyCmdQueue.bind(this), 500);
	}
}