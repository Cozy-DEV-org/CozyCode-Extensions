// Minimal LSP client for CozyCode extensions. Speaks JSON-RPC over stdio via
// cozy.process, frames by Content-Length, and exposes completion/hover. Shared,
// verbatim, by the Lua LSP and Roblox LSP extensions.
'use strict';

const EXT_FOR = { lua: '.lua', typescript: '.ts', javascript: '.js', typescriptreact: '.tsx', javascriptreact: '.jsx' };
function pathToUri(p, langId) {
	if (!p || p.startsWith('untitled')) return 'file:///_cozy_untitled' + (EXT_FOR[langId] || '.txt');
	let s = p.replace(/\\/g, '/');
	if (!/^\//.test(s)) s = '/' + s;                       // C:/x -> /C:/x
	return 'file://' + encodeURI(s).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

function resolveSection(obj, section) {
	if (!section) return obj || null;
	let cur = obj;
	for (const part of section.split('.')) { if (cur == null) return null; cur = cur[part]; }
	return cur === undefined ? null : cur;
}

// opts: { exe, args, cwd, rootUri, rootPath, settings }
function createLsp(opts) {
	let proc = null, ready = false, reqId = 0;
	const pending = {};
	const opened = {};
	let buf = new Uint8Array(0);
	const enc = new TextEncoder(), dec = new TextDecoder();

	function raw(msg) {
		const s = JSON.stringify(msg);
		proc.write('Content-Length: ' + enc.encode(s).length + '\r\n\r\n' + s);
	}
	function request(method, params, timeout) {
		const id = ++reqId;
		return new Promise(res => {
			pending[id] = res;
			raw({ jsonrpc: '2.0', id, method, params });
			setTimeout(() => { if (pending[id]) { delete pending[id]; res(null); } }, timeout || 8000);
		});
	}
	function notify(method, params) { raw({ jsonrpc: '2.0', method, params }); }

	function headerEnd(b) {
		for (let i = 0; i + 3 < b.length; i++)
			if (b[i] === 13 && b[i + 1] === 10 && b[i + 2] === 13 && b[i + 3] === 10) return i;
		return -1;
	}
	function onData(bytes) {
		const nb = new Uint8Array(buf.length + bytes.length); nb.set(buf); nb.set(bytes, buf.length); buf = nb;
		for (; ;) {
			const he = headerEnd(buf);
			if (he < 0) return;
			const m = dec.decode(buf.slice(0, he)).match(/Content-Length:\s*(\d+)/i);
			if (!m) { buf = buf.slice(he + 4); continue; }
			const len = +m[1], start = he + 4;
			if (buf.length < start + len) return;            // wait for the rest
			const body = dec.decode(buf.slice(start, start + len));
			buf = buf.slice(start + len);
			let msg; try { msg = JSON.parse(body); } catch (e) { continue; }
			dispatch(msg);
		}
	}
	function dispatch(msg) {
		if (msg.id !== undefined && msg.method) {              // server -> client request
			let result = null;
			if (msg.method === 'workspace/configuration')
				result = (msg.params.items || []).map(it => resolveSection(opts.settings || {}, it.section));
			raw({ jsonrpc: '2.0', id: msg.id, result });
			return;
		}
		if (msg.id !== undefined && pending[msg.id]) {         // response to our request
			const r = pending[msg.id]; delete pending[msg.id];
			r(msg.error ? null : (msg.result !== undefined ? msg.result : null));
		}
		// server notifications (publishDiagnostics, $/progress, ...) ignored for now
	}

	async function start() {
		proc = await cozy.process.spawn(opts.exe, opts.args || [], opts.cwd || '');
		proc.onData(onData);
		proc.onExit(() => { ready = false; });
		await request('initialize', {
			processId: null,
			rootUri: opts.rootUri || null,
			rootPath: opts.rootPath || null,
			workspaceFolders: opts.rootUri ? [{ uri: opts.rootUri, name: 'workspace' }] : null,
			initializationOptions: opts.settings || {},
			capabilities: {
				textDocument: {
					synchronization: { didSave: false, dynamicRegistration: false },
					completion: { contextSupport: true, completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'], insertReplaceSupport: false } },
					hover: { contentFormat: ['markdown', 'plaintext'] },
				},
				workspace: { configuration: true, didChangeConfiguration: { dynamicRegistration: true }, workspaceFolders: true },
			},
		}, 20000);
		notify('initialized', {});
		if (opts.settings) notify('workspace/didChangeConfiguration', { settings: opts.settings });
		ready = true;
	}

	function sync(uri, languageId, text) {
		if (opened[uri] === undefined) { opened[uri] = 1; notify('textDocument/didOpen', { textDocument: { uri, languageId, version: 1, text } }); }
		else { opened[uri]++; notify('textDocument/didChange', { textDocument: { uri, version: opened[uri] }, contentChanges: [{ text }] }); }
	}

	async function completion(p) {
		if (!ready) return [];
		const uri = pathToUri(p.uri, p.languageId);
		sync(uri, p.languageId || 'lua', p.text);
		const res = await request('textDocument/completion', { textDocument: { uri }, position: { line: p.line, character: p.character }, context: { triggerKind: 1 } }, 5000);
		if (!res) return [];
		return Array.isArray(res) ? res : (res.items || []);
	}
	async function hover(p) {
		if (!ready) return null;
		const uri = pathToUri(p.uri, p.languageId);
		sync(uri, p.languageId || 'lua', p.text);
		return request('textDocument/hover', { textDocument: { uri }, position: { line: p.line, character: p.character } }, 3000);
	}
	// completionItem/resolve — servers defer detail + documentation to this call
	async function resolve(item) {
		if (!ready || !item) return item;
		const res = await request('completionItem/resolve', item, 3000);
		return res || item;
	}

	return { start, completion, hover, resolve, isReady: () => ready };
}
