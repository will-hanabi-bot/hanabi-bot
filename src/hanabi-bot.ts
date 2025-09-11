import * as https from 'https';
import * as http from 'http';

import { Bot } from './command-handler.ts';
import { initConsole } from './tools/console.js';
import * as Utils from './tools/util.js';
import { HANABI_HOSTNAME, HANABI_PORT, SSL_ENABLED } from './constants.js';

/**
 * Logs in to hanab.live and returns the session cookie to authenticate future requests.
 */
function connect(bot_index = '') {
	const u_field = `HANABI_USERNAME${bot_index}`, p_field = `HANABI_PASSWORD${bot_index}`;

	if (process.env[u_field] === undefined || process.env[p_field] === undefined)
		throw new Error(`Missing ${u_field} and ${p_field} environment variables.`);

	const username = encodeURIComponent(process.env[u_field]);
	const password = encodeURIComponent(process.env[p_field]);
	const data = `username=${username}&password=${password}&version=bot`;

	const options = {
		hostname: HANABI_HOSTNAME,
		port: HANABI_PORT,
		path: '/login',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': data.length
		}
	};

	return new Promise<string>((resolve, reject) => {
		// Send login request to hanab.live
		const protocol = HANABI_PORT === 334 ? https : http;
		const req = protocol.request(options, (res) => {
			console.log(`Request status code: ${res.statusCode}`);

			const cookie = res.headers['set-cookie']?.[0];
			if (cookie == null) {
				reject('Failed to parse cookie from auth headers.');
				return;
			}

			res.on('data', (data) => process.stdout.write(data));
			resolve(cookie);
		});

		req.on('error', (error) => {
			reject(`Request error: ${error}`);
			return;
		});

		// Write data body to POST request
		req.write(data);
		req.end();
	});
}

declare var WebSocket: typeof import("undici-types").WebSocket;

async function main() {
	if (Number(process.versions.node.split('.')[0]) < 22)
		throw new Error(`This program requires Node v22 or above! Currently using Node v${process.versions.node}.`);

	const { index, manual } = Utils.parse_args();

	// Connect to server using credentials
	const cookie = await connect(index);

	// Establish websocket
	const wsUrl = (() => {
		if (SSL_ENABLED) return `wss://${HANABI_HOSTNAME}/ws`;
		else return `ws://${HANABI_HOSTNAME}:${HANABI_PORT}/ws`;
	})();
	const ws = new WebSocket(wsUrl, { headers: { Cookie: cookie } });

	const bot = new Bot(ws, manual !== undefined);
	initConsole(bot);

	ws.addEventListener('open', () => console.log('Established websocket connection!'));
	ws.addEventListener('error', (event) => console.log('Websocket error:', event));
	ws.addEventListener('close', (event) => console.log(`Websocket closed from server. ${event.code} ${event.reason}`));

	ws.addEventListener('message', (event) => {
		// Websocket messages are in the format: commandName {"field_name":"value"}
		const str = event.data.toString();
		const ind = str.indexOf(' ');
		const [command, arg] = [str.slice(0, ind), str.slice(ind + 1)];

		// Handle the command if there's a registered handler function for it
		bot.handle_msg(command, JSON.parse(arg));
	});
}

main().catch(console.error);
