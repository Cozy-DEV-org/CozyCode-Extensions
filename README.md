# CozyCode Extensions

Native CozyCode extensions (`.cext`). Import via the Extensions view → **Import
Extension (.cext / .zip)**, or Command Palette → *Extensions: Install from File*.

An extension is a folder with `cozy.json` + a web entry, packaged as a `.cext`
(renamed `.zip`). It runs in a sandboxed iframe and talks to CozyCode only through
the injected `cozy` API — it can't touch the editor core. See
[`app/docs/Writing-Extensions.md`](../app/docs/Writing-Extensions.md) to build your own.

## Roblox Studio sync (bi-directional)

| Extension | What it does |
|---|---|
| **roblox-sync** | Mirrors **every script** in a Roblox place to disk and back — including scripts nested many levels deep in Models / Parts. Live instance tree (VisualPreview), new files on disk become Instances in Studio, external edits auto-reload, and a conflict prompt when disk and Studio diverge. |

- Two halves: the **CozyCode extension** (this `.cext`, a right-side panel) + the
  **CozySync Studio plugin** in [`roblox-sync/plugin/`](roblox-sync/plugin/). Install the
  plugin into Studio (`%LOCALAPPDATA%\Roblox\Plugins\`, or *Save to Roblox* as a local
  plugin) and enable **Game Settings → Security → Allow HTTP Requests**.
- The extension spawns a small **Node.js** HTTP server (`server.js`, built-ins only) that
  bridges the Studio plugin and the files under `src/`. Requires **Node.js on PATH**.
- **Only script `.Source` is synced** — Parts, geometry, and properties are never touched.
- Full setup + workflow: [`roblox-sync/README.md`](roblox-sync/README.md).

## Language servers (real LSP — autocomplete, hover, signatures)

| Extension | Server | Use for |
|---|---|---|
| **lua-lsp** | [LuaLS/lua-language-server](https://github.com/LuaLS/lua-language-server) | plain Lua |
| **roblox-lsp** | [NightrainsRbx/RobloxLsp](https://github.com/NightrainsRbx/RobloxLsp) | Roblox (Luau + full Roblox API) |
| **node-lsp** | [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server) (on [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)) | JavaScript / TypeScript / JSX / TSX |

- **lua-lsp / roblox-lsp** download a self-contained server binary (~4 MB) on **first
  activation** (you confirm). Cached in `data/ext-data/<id>/` — downloads once, needs
  nothing installed system-wide.
- **node-lsp** installs its server via **npm** on first activation (you confirm) into
  `data/ext-data/cozy.node-lsp/`. Requires **Node.js + npm on PATH**. Runs on `node`.
- lua-lsp and roblox-lsp both provide Lua completion, so **enable one at a time** (Lua
  LSP for plain Lua, Roblox LSP for Roblox). node-lsp covers JS/TS and is independent.

## How they work

An LSP extension is a headless CozyCode extension (plain JS in a sandboxed iframe). It
spawns the language server via `cozy.process`, speaks LSP JSON-RPC over stdio (see the
shared `lsp.js`), and feeds completions/hover into the editor via
`cozy.languages.register*`. No Node, no VS Code. See
[`app/docs/Writing-Extensions.md`](../app/docs/Writing-Extensions.md) to build your own.

## Packaging

```powershell
cd lua-lsp
Compress-Archive -Path * -DestinationPath ..\lua-lsp.zip -Force
Rename-Item ..\lua-lsp.zip ..\lua-lsp.cext
```
