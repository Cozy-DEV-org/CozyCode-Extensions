# Roblox Sync (CozySync)

Bi-directional sync between **Roblox Studio** and **CozyCode**. Edit your scripts in a
real IDE (LSP, Prettier, git, AI) and have every change reflected in Studio — and vice
versa.

**Why this one is different:** most sync plugins only pick up `Script` / `LocalScript` /
`ModuleScript` that sit directly in a Folder or a service. CozySync walks the **whole
DataModel**, so scripts nested inside **Models, Parts, BaseParts — at any depth** — are
mirrored too. It only ever reads/writes a script's `.Source`; Parts, geometry, and other
properties are **never touched**, so your place stays exactly as it was.

## Parts

1. **CozyCode extension** (this) — spawns a small Node sync server, shows the live
   instance tree, and resolves conflicts. Needs **Node.js on PATH**.
2. **Studio plugin** — [`plugin/CozySync.server.lua`](plugin/CozySync.server.lua).

## Setup

1. **Install the extension** — import `roblox-sync.cext` in CozyCode, open your project
   folder, then open the **Roblox Sync** panel (right side bar, `Ctrl+Alt+B`). It starts
   the sync server automatically.
2. **Install the Studio plugin**:
   - In Studio, the **Plugins** tab → click the small folder icon (**Plugins Folder**).
   - Copy `plugin/CozySync.server.lua` into that folder.
   - Back in Studio, Plugins tab → it appears as **CozySync**. (Or select the file in the
     Explorer and use **Save as Local Plugin**.) See the
     [official plugin docs](https://create.roblox.com/docs/studio/plugins) and this
     [community guide](https://devforum.roblox.com/t/a-comprehensive-guide-on-making-roblox-plugins/2449141).
3. **Enable HTTP** — Studio → **Game Settings → Security → Allow HTTP Requests** (the
   plugin talks to `http://127.0.0.1:34872`, your local sync server only).
4. Click the **CozySync** toolbar button in Studio to connect. Scripts appear under
   `src/` in CozyCode, mirroring the instance tree.

## How it maps to files

```
src/<Service>/<...>/<Name>.server.luau   -- a Script
src/<Service>/<...>/<Name>.client.luau   -- a LocalScript
src/<Service>/<...>/<Name>.luau          -- a ModuleScript
```

`.cozy-roblox/manifest.json` records every file's full **instance path**, class, and the
class of its parent — so an AI (Claude Code) reading it knows *exactly* where each script
lives (e.g. "a Script inside a Part inside a Model in Workspace").

## Conflicts

If Studio disconnects (5s+) while you keep editing on disk, the next Studio snapshot is
**held** and the panel asks **Keep Disk** or **Keep Studio** before anything is
overwritten. Disk files can be as large as you like.

## Notes

- Bi-directional: Studio edits → disk (on change), disk edits → Studio (polled ~1.5s).
- Identity is path-based (no attributes added to your instances). Renaming an instance in
  Studio re-mirrors it under the new path.
