import { types } from 'node:util';
import * as Utils from './tools/util.js';

/**
 * @typedef {{op: 'add' | 'replace', path: string[], value: unknown }} Patch
 */

/**
 * How it works:
 * 
 * We first create a proxy for the drafted object.
 * On obj access, we create nested proxies because they may show up on the LHS of an assignment.
 *   This is tracked by StateProxy.proxies.
 * On obj modification, we update all parents to become modified.
 *   For each parent, we also create StateProxy.copy, which is a copy of base but with proxies instead of objects.
 *   The proxies are carried over from StateProxy.proxies, which is no longer used after this point.
 *   We track all modified props using Stateproxy.modified_props, including parent-child relationships.
 * 
 * At the end of the producer function, we call finalize() recursively on StateProxy.copy.
 * Any modified props of a proxy are re-assigned to actual values.
 */

const PROXY_STATE = Symbol();

const objectTraps = {
	/**
	 * @param {StateProxy<unknown>} state
	 * @param {string | typeof PROXY_STATE} prop
	 */
	get: (state, prop) => {
		// Getting the non-proxied state from a proxied state
		if (prop === PROXY_STATE)
			return state;

		// If state has been modified, we need to use the copy instead of the base
		if (state.modified) {
			const value = state.copy[prop];

			// Value is already modified, proxied or primitive
			if (value !== state.base[prop] || !isProxyable(value))
				return value;

			// Make a nested proxy so we can continue monitoring changes
			state.copy[prop] = createProxy(value, { proxy: state, own_key: prop });
			return state.copy[prop];
		}

		// Value is already proxied
		if (state.proxies[prop] !== undefined)
			return state.proxies[prop];

		const value = state.base[prop];

		if (!isProxyable(value))
			return value;

		state.proxies[prop] = createProxy(value, { proxy: state, own_key: prop });
		return state.proxies[prop];
	},
	/**
	 * @param {StateProxy<unknown>} state
	 * @param {string} prop
	 * @param {unknown} value
	 */
	set: (state, prop, value) => {
		if (!state.modified) {
			// No change
			if ((state.proxies[prop] ?? state.base[prop]) === value)
				return true;

			// This state and all parents have now been modified
			state.markChanged();
		}

		state.modified_props.add(prop);
		state.copy[prop] = value;
		return true;
	},
	has: (state, prop) => prop in state.source,
	ownKeys: (state) => Reflect.ownKeys(state.source),
	apply: (target, thisArg, argumentsList) => {
		return Reflect.apply(target, thisArg, argumentsList);
	}
};

const arrayTraps = {};
for (const [key, fn] of Object.entries(objectTraps)) {
	arrayTraps[key] = function() {
		arguments[0] = arguments[0][0];
		return fn.apply(this, arguments);
	};
}

function isProxyable(value) {
	return !types.isProxy(value) && typeof value === 'object';
}

/**
 * @template T
 */
class StateProxy {
	modified = false;
	finalized = false;

	/**@type {T} */
	base;

	/** @type {T} */
	copy;

	/** @type {{proxy: StateProxy, own_key: string}} */
	parent;

	/** @type {Set<string | number>} */
	modified_props = new Set();

	/** @type {Record<string, StateProxy>} */
	proxies = {};

	/**
	 * @param {T} base
	 * @param {{proxy: StateProxy, own_key: string}} parent
	 */
	constructor(base, parent = undefined) {
		this.parent = parent;
		this.base = base;
	}

	get source() {
		return this.modified ? this.copy : this.base;
	}

	markChanged() {
		if (this.modified)
			return;

		this.modified = true;
		this.copy = Utils.shallowCopy(this.base);

		Object.assign(this.copy, this.proxies);

		// Propagate modified status to parents
		if (this.parent !== undefined) {
			const { proxy, own_key } = this.parent;
			proxy.markChanged();
			proxy.modified_props.add(own_key);
		}
	}
}
let revokes = [];

/**
 * @template T
 * @param {T} base
 * @param {{proxy: StateProxy, own_key: string}} parent
 * @returns {StateProxy<T>}
 */
function createProxy(base, parent = undefined) {
	const state = new StateProxy(base, parent);
	const { proxy, revoke } = Array.isArray(base) ? Proxy.revocable([state], arrayTraps) : Proxy.revocable(state, objectTraps);

	revokes.push(revoke);
	return proxy;
}

/** @param {unknown} value */
export function original(value) {
	return (value && value[PROXY_STATE]) ? value[PROXY_STATE].base : undefined;
}

/**
 * @template T
 * @param {(draft: { -readonly [P in keyof T]: T[P] }, ...args: unknown[]) => void} func
 */
export function produceC(func) {
	/** @type {(state: T, ...args: unknown[]) => T} */
	return (state, ...args) =>
		produce(state, draft =>
			func.call(draft, draft, ...args)
		);
}

/**
 * @template T
 * @param {T} base
 * @param {(draft: { -readonly [P in keyof T]: T[P] }) => void} producer
 * @param {(patches: Patch[]) => void} [patchListener]
 */
export function produce(base, producer, patchListener) {
	// Save old revokes/cards in case we're nesting produce() calls
	const old_revokes = revokes;
	revokes = [];

	const rootClone = createProxy(base);
	producer(/** @type {{ -readonly [P in keyof T]: T[P] }} */ (/** @type {unknown} */ (rootClone)));
	const patches = /** @type {Patch[]} */ ([]);
	const res = patchListener ? finalize(rootClone, [], patches) : finalize(rootClone);

	// Revoke all proxies created
	for (const revoke of revokes)
		revoke();
	revokes = old_revokes;

	if (patchListener)
		patchListener(patches);

	return res;
}

/**
 * @template T
 * @param {StateProxy<T> | T} base
 * @param {string[]} [path]
 * @param {object[] | undefined} [patches]
 * @returns {T}
 */
function finalize(base, path, patches) {
	if (types.isProxy(base)) {
		const state = base[PROXY_STATE];
		if (!state.modified)
			return state.base;

		if (state.finalized)
			return state.copy;

		state.finalized = true;
		const result = finalizeObject(state, path, patches);

		if (patches)
			generatePatches(state, path, patches, state.base, result);

		return result;
	}

	return /** @type {T} */ (base);
}

/**
 * @template T
 * @param {StateProxy<T>} state
 * @param {string[]} path
 * @param {Patch[] | undefined} patches
 */
function finalizeObject(state, path, patches) {
	const { base, copy, modified_props } = state;

	for (const [key, value] of Object.entries(copy)) {
		if (value !== base[key]) {
			if (patches && modified_props.has(key) === undefined)
				copy[key] = finalize(value, path.concat(key), patches);
			else
				copy[key] = finalize(copy[key]);
		}
	}

	return copy;
	// return Object.freeze(copy);
}

/**
 * @template T
 * @param {StateProxy<T>} state
 * @param {string[]} basepath
 * @param {Patch[]} patches
 * @param {T} baseValue
 * @param {T} resultValue
 */
function generatePatches(state, basepath, patches, baseValue, resultValue) {
	if (Array.isArray(baseValue))
		return generateArrayPatches(/** @type {StateProxy<unknown[]>} */(state), basepath, patches, baseValue, /** @type {unknown[]} */(resultValue));
	else
		return generateObjectPatches(state, basepath, patches, baseValue, resultValue);
}

/**
 * @template {Array} T
 * @param {StateProxy<T>} state
 * @param {string[]} basepath
 * @param {Patch[]} patches
 * @param {T} baseValue
 * @param {T} resultValue
 */
function generateArrayPatches(state, basepath, patches, baseValue, resultValue) {
	const shared = Math.min(baseValue.length, resultValue.length);

	for (let i = 0; i < shared; i++) {
		if (state.modified_props.has(i) && baseValue[i] !== resultValue[i])
			patches.push({ op: 'replace', path: basepath.concat(`${i}`), value: resultValue[i] });
	}

	if (shared < resultValue.length) {
		// stuff was added
		for (let i = shared; i < resultValue.length; i++)
			patches.push({ op: 'add', path: basepath.concat(`${i}`), value: resultValue[i] });
	}
	else if (shared < baseValue.length) {
		// stuff was removed
		patches.push({ op: 'replace', path: basepath.concat('length'), value: resultValue.length });
	}
}

/**
 * @template {Record<string, any>} T
 * @param {StateProxy<T>} state
 * @param {string[]} basepath
 * @param {Patch[]} patches
 * @param {T} baseValue
 * @param {T} resultValue
 */
function generateObjectPatches(state, basepath, patches, baseValue, resultValue) {
	for (const key of state.modified_props) {
		const origValue = baseValue[key];
		const value = resultValue[key];
		const op = key in baseValue ? 'replace' : 'add';

		if (origValue === baseValue && op === 'replace')
			continue;

		patches.push({ op, path: basepath.concat(key.toString()), value });
	}
}

/**
 * @param {unknown} draft
 * @param {Patch[]} patches
 */
export function applyPatches(draft, patches) {
	for (const patch of patches) {
		const { path } = patch;

		if (path.length === 0 && patch.op === 'replace') {
			draft = patch.value;
			continue;
		}

		let base = draft;
		for (const route of path.slice(0, -1)) {
			base = base[route];

			if (!base || typeof base !== 'object')
				throw new Error(`Cannot apply patch, path doesn't resolve: ${path.join('/')}`);
		}

		base[path.at(-1)] = patch.value;
	}
	return draft;
}
