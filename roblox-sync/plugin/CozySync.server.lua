--!nocheck
-- CozySync — Roblox Studio plugin half of CozyCode's bi-directional sync.
-- Install: Studio -> save this file to your Plugins folder (right-click the toolbar
-- "Plugins Folder"), or select it and Plugins tab -> "Save as Local Plugin".
-- Enable HTTP: Game Settings -> Security -> Allow HTTP Requests.
-- Docs: https://create.roblox.com/docs/studio/plugins
--
-- Unlike simple sync plugins, this walks the WHOLE DataModel, so scripts nested inside
-- Models / Parts / BaseParts (at any depth) are captured too. It only ever reads/writes
-- script .Source — Parts, geometry, and other properties are never touched.

local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local RunService = game:GetService("RunService")

local BASE = "http://127.0.0.1:34872"

-- top-level services to skip (protected / internal; everything else is walked)
local DENY = { CoreGui = true, CorePackages = true, CoreScriptSyncService = true, ScriptContext = true }

local toolbar = plugin:CreateToolbar("CozySync")
local button = toolbar:CreateButton("Sync", "Toggle CozyCode sync", "rbxasset://textures/AnimationEditor/icon_checkmark.png")
button.ClickableWhenViewportHidden = true

local syncing = false
local pushConn, pullTask

local function isScript(inst)
	return inst:IsA("LuaSourceContainer")
end

-- Build a pruned tree: keep only scripts and the containers that hold them.
local function build(inst)
	local kids = {}
	for _, c in ipairs(inst:GetChildren()) do
		local kn = build(c)
		if kn then kids[#kids + 1] = kn end
	end
	local scriptNode = isScript(inst)
	if not scriptNode and #kids == 0 then
		return nil -- prune non-script leaves (e.g. a Part with no scripts under it)
	end
	local node = { name = inst.Name, className = inst.ClassName, children = kids }
	if scriptNode then
		node.source = inst.Source
		node.parentClass = inst.Parent and inst.Parent.ClassName or ""
	end
	return node
end

local function snapshot()
	-- walk EVERY top-level service (not a fixed list) so no script is missed
	local tree = {}
	for _, svc in ipairs(game:GetChildren()) do
		if not DENY[svc.ClassName] and not DENY[svc.Name] then
			local ok, node = pcall(build, svc)
			if ok and node then tree[#tree + 1] = node end
		end
	end
	return tree
end

local function post(pathName, payload)
	local ok, err = pcall(function()
		HttpService:RequestAsync({
			Url = BASE .. pathName,
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json" },
			Body = HttpService:JSONEncode(payload),
		})
	end)
	return ok, err
end

local function pushSnapshot()
	local ok, err = post("/snapshot", { tree = snapshot() })
	if not ok then warn("[CozySync] push failed: " .. tostring(err)) end
end

-- resolve "Workspace.Model.Part.Handler" to the Instance (path-based, no attributes)
local function resolvePath(p)
	local parts = string.split(p, ".")
	local cur = game:FindFirstChild(parts[1]) or (pcall(function() return game:GetService(parts[1]) end) and game:GetService(parts[1]))
	for i = 2, #parts do
		if not cur then return nil end
		cur = cur:FindFirstChild(parts[i])
	end
	return cur
end

-- resolve the parent of an instance path, creating Folders for any missing segments;
-- returns (parentInstance, leafName)
local function ensureParent(p)
	local parts = string.split(p, ".")
	local cur = game:FindFirstChild(parts[1]) or (pcall(function() return game:GetService(parts[1]) end) and game:GetService(parts[1]))
	if not cur then return nil end
	for i = 2, #parts - 1 do
		local nxt = cur:FindFirstChild(parts[i])
		if not nxt then
			nxt = Instance.new("Folder")
			nxt.Name = parts[i]
			nxt.Parent = cur
		end
		cur = nxt
	end
	return cur, parts[#parts]
end

local function applyEdits()
	local ok, resp = pcall(function() return HttpService:GetAsync(BASE .. "/pull") end)
	if not ok then return end
	local data
	ok, data = pcall(function() return HttpService:JSONDecode(resp) end)
	if not ok or not data or not data.changes then return end
	if #data.changes == 0 then return end
	local rec = ChangeHistoryService:TryBeginRecording("CozySync apply") or nil
	for _, ch in ipairs(data.changes) do
		if ch.create then
			-- a file created in the editor -> make the Instance in Studio
			local parent, name = ensureParent(ch.instancePath)
			if parent and not parent:FindFirstChild(name) then
				local inst = Instance.new(ch.className)
				inst.Name = name
				inst.Source = ch.source or ""
				inst.Parent = parent
			end
		else
			local inst = resolvePath(ch.instancePath)
			if inst and inst:IsA("LuaSourceContainer") and inst.Source ~= ch.source then
				inst.Source = ch.source
			end
		end
	end
	if rec then ChangeHistoryService:FinishRecording(rec, Enum.FinishRecordingOperation.Commit) end
end

local function start()
	syncing = true
	button:SetActive(true)
	pushSnapshot()
	pullTask = task.spawn(function()
		while syncing do
			task.wait(2)
			applyEdits()   -- disk -> Studio (editor edits)
			pushSnapshot() -- Studio -> disk (structure + Source edits; server keeps unsynced disk edits)
		end
	end)
	print("[CozySync] connected to " .. BASE)
end

local function stop()
	syncing = false
	button:SetActive(false)
	print("[CozySync] stopped")
end

button.Click:Connect(function()
	if syncing then stop() else start() end
end)

plugin.Unloading:Connect(stop)
