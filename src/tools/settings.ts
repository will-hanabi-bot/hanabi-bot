import { BOT_VERSION } from '../constants.js';
import logger from './logger.js';

type AnySettings = {
	convention: String,
	level: number | undefined;
};

export function settingsString(settings: AnySettings) {
	return settings.convention + (settings.convention === 'HGroup' ? `${settings.level}` : '');
}

export function infoNote(settings: AnySettings) {
	return `[INFO: v${BOT_VERSION}, ${settingsString(settings)}]`;
}

type ParsedSetting = { convention: 'HGroup', level: number; } | { convention: 'RefSieve', level: undefined; } | { convention: 'PlayfulSieve', level: undefined; };

/**
 * Parses the bot's level from the note on the first card.
 * Note format: [INFO: vX.X, ConventionLevel]
 * Examples: [INFO: v1.0, HGroup5], [INFO: v1.0, RefSieve], [INFO: v1.0, PlayfulSieve]
 * @param {string | undefined} note
 * @returns {ParsedSetting | undefined}
 */
export function parseSettingsFromNote(note: string | undefined): ParsedSetting | undefined {
	if (!note || !note.startsWith('[INFO:')) {
		return undefined;
	}

	const parts = note.split('|', 2);
	let info = parts[0].trim();
	info = info.substring(info.indexOf('['), info.indexOf(']'));
	const convStr = info.split(',', 2)[1].trim();

	if (convStr.startsWith('HGroup')) {
		return { convention: 'HGroup', level: Number(convStr.slice('HGroup'.length)) };
	} else if (convStr === 'RefSieve') {
		return { convention: 'RefSieve', level: undefined };
	} else if (convStr === 'PlayfulSieve') {
		return { convention: 'PlayfulSieve', level: undefined };
	}

	return undefined;
}