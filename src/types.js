/**
 * @typedef {import('./basics/Card.js').Card} Card
 * @typedef {typeof import('./constants.js').CLUE} CLUE
 * @typedef {typeof import('./constants.js').ACTION} ACTION
 * @typedef {typeof import('./conventions/h-group/h-constants.js').CLUE_INTERP} CLUE_INTERP
 * @typedef {typeof import('./conventions/h-group/h-constants.js').PLAY_INTERP} PLAY_INTERP
 * @typedef {typeof import('./conventions/h-group/h-constants.js').DISCARD_INTERP} DISCARD_INTERP
 * @typedef {CLUE_INTERP[keyof CLUE_INTERP] | PLAY_INTERP[keyof PLAY_INTERP] | DISCARD_INTERP[keyof DISCARD_INTERP]} INTERP
 */
/**
 * @template T
 * @typedef {{ -readonly [P in keyof T]: T[P] }} Writable
 */
/**
 * @typedef Identity
 * @property {number} suitIndex
 * @property {number} rank
 */
/**
 * @typedef BaseClue
 * @property {CLUE[keyof CLUE]} type
 * @property {number} value
 * 
 * @typedef {BaseClue & {target: number, result?: ClueResult}} Clue
 * @typedef {Clue & {playable: boolean, cm: number[], safe: boolean}} SaveClue
 * @typedef {Clue & {urgent: boolean, trash: boolean}} FixClue
 */
/**
 * @typedef {{focus: number, chop: boolean, positional: boolean}} FocusResult
 * 
 * @typedef ClueResult
 * @property {number} focus
 * @property {number} elim
 * @property {Card[]} new_touched
 * @property {number[]} bad_touch
 * @property {number[]} cm_dupe
 * @property {number[]} trash
 * @property {number} avoidable_dupe
 * @property {number} remainder
 * @property {number} discard
 * @property {{playerIndex: number, card: Card}[]} playables
 * @property {{playerIndex: number, card: Card}[]} finesses
 * @property {number[]} chop_moved
 * @property {CLUE_INTERP[keyof CLUE_INTERP]} interp
 * @property {boolean} safe
 */
/**
 * @typedef Connection
 * @property {'known' | 'playable' | 'prompt' | 'finesse' | 'terminate' | 'positional'} type
 * @property {number} reacting
 * @property {number} order
 * @property {Identity[]} identities	The possible identities this card could be playing as (can be multiple, if we're playing into a layered finesse or known bluff).
 * @property {boolean} [self]
 * @property {boolean} [hidden]
 * @property {boolean} [bluff]
 * @property {boolean} [possibly_bluff]
 * @property {number[]} [linked]	Only used in 'playable' connections.
 * @property {boolean} [layered]	Only used in 'playable' connections.
 * @property {boolean} [certain]
 * @property {boolean} [asymmetric]		Only used in 'known' connections.
 * 
 * @typedef FocusPossibility
 * @property {number} suitIndex
 * @property {number} rank
 * @property {Connection[]} connections
 * @property {boolean} [save]
 * @property {INTERP} interp
 * @property {boolean} [illegal]
 *
 * @typedef {Omit<FocusPossibility, 'interp'> & { fake?: boolean }} SymFocusPossibility
 */
/**
 * @typedef WaitingConnection
 * @property {Connection[]} connections
 * @property {number} giver
 * @property {number} target
 * @property {number} conn_index
 * @property {number} turn
 * @property {number} focus
 * @property {Identity} inference
 * @property {number} action_index
 * @property {boolean} [ambiguousPassback]
 * @property {boolean} [selfPassback]
 * @property {boolean} [symmetric]
 * @property {boolean} [rewinded]
 * 
 * @typedef Demonstration
 * @property {number} order
 * @property {Identity} inference
 * @property {Connection[]} connections
 */
/**
 * @typedef Link
 * @property {number[]} orders
 * @property {Identity[]} identities
 * @property {boolean} promised
 * @property {number} [target]	Only on promised links (but not for sarcastic transfers).
 */

export {};
