export interface SampleScript {
  id: string;
  name: string;
  profile: 'roblox_studio' | 'executor_ext';
  description: string;
  code: string;
}

export const SAMPLE_SCRIPTS: SampleScript[] = [
  {
    id: 'roblox_print_hi',
    name: 'Standard Roblox Studio print("Hi") Test Fixture',
    profile: 'roblox_studio',
    description: 'Minimal test case verifying direct execution without loadstring dependencies.',
    code: `print("Hi")`
  },
  {
    id: 'roblox_unicode_test',
    name: 'Unicode UTF-8 & Multilingual print("สวัสดี Hi 🎮")',
    profile: 'roblox_studio',
    description: 'Verifies UTF-8 multi-byte encoding and decoding for international characters and emojis.',
    code: `print("สวัสดี Hi 🎮")`
  },
  {
    id: 'roblox_leaderstats',
    name: 'Roblox Studio Leaderstats & Level Progression Manager',
    profile: 'roblox_studio',
    description: 'Server Script managing player data, non-overlapping level progression table (Min/Max disjoint), and auto-save loops.',
    code: `-- Leaderstats & Level Progression Manager (ServerScriptService)
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local PlayerDataStore = DataStoreService:GetDataStore("PlayerData_v2")

-- Level Progression Table: Strict Disjoint Non-Overlapping Intervals
-- Level 1: 0..99, Level 2: 100..249, Level 3: 250..499, Level 4: 500..999, Level 5: 1000..inf
local LEVEL_TIERS = {
    { Level = 1, MinExp = 0,    MaxExp = 99 },
    { Level = 2, MinExp = 100,  MaxExp = 249 },
    { Level = 3, MinExp = 250,  MaxExp = 499 },
    { Level = 4, MinExp = 500,  MaxExp = 999 },
    { Level = 5, MinExp = 1000, MaxExp = math.huge },
}

local function getLevelForExp(exp)
    for _, tier in ipairs(LEVEL_TIERS) do
        if exp >= tier.MinExp and exp <= tier.MaxExp then
            return tier.Level
        end
    end
    return 1
end

local function onPlayerAdded(player)
    local leaderstats = Instance.new("Folder")
    leaderstats.Name = "leaderstats"
    leaderstats.Parent = player

    local exp = Instance.new("IntValue")
    exp.Name = "Experience"
    exp.Value = 0
    exp.Parent = leaderstats

    local level = Instance.new("IntValue")
    level.Name = "Level"
    level.Value = 1
    level.Parent = leaderstats

    local success, data = pcall(function()
        return PlayerDataStore:GetAsync("User_" .. player.UserId)
    end)

    if success and data then
        exp.Value = data.Experience or 0
        level.Value = getLevelForExp(exp.Value)
        print("Loaded player data for: " .. player.Name .. " (Level: " .. tostring(level.Value) .. ")")
    else
        warn("Could not load data for: " .. player.Name)
    end

    exp.Changed:Connect(function(newExp)
        level.Value = getLevelForExp(newExp)
    end)
end

local function onPlayerRemoving(player)
    local leaderstats = player:FindFirstChild("leaderstats")
    if not leaderstats then return end

    local exp = leaderstats:FindFirstChild("Experience")
    local level = leaderstats:FindFirstChild("Level")

    local payload = {
        Experience = exp and exp.Value or 0,
        Level = level and level.Value or 1
    }

    pcall(function()
        PlayerDataStore:SetAsync("User_" .. player.UserId, payload)
    end)
end

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)
`
  },
  {
    id: 'roblox_character_controller',
    name: 'Character Movement & Safe Multi-Layer GUI System',
    profile: 'roblox_studio',
    description: 'Client LocalScript with safe Character/HumanoidRootPart existence checks and multi-level GUI verification.',
    code: `-- Character Sprint & Safe Multi-Layer GUI System (StarterPlayerScripts)
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local Players = game:GetService("Players")

local player = Players.LocalPlayer
local DEFAULT_SPEED = 16
local SPRINT_SPEED = 28
local STAMINA_MAX = 100
local currentStamina = STAMINA_MAX
local isSprinting = false

-- Safe Character & HumanoidRootPart Retrieval: Verifies part existence every single time
local function getActiveCharacterParts()
    local char = player.Character
    if not char or not char.Parent then return nil, nil, nil end
    local hum = char:FindFirstChildOfClass("Humanoid")
    local hrp = char:FindFirstChild("HumanoidRootPart")
    if not hum or hum.Health <= 0 or not hrp or not hrp.Parent then
        return nil, nil, nil
    end
    return char, hum, hrp
end

-- Safe Multi-Layer GUI Traversal: Inspects every hierarchical level before accessing children
local function getStaminaGuiFill()
    local playerGui = player:FindFirstChildOfClass("PlayerGui")
    if not playerGui then return nil end
    
    local staminaScreenGui = playerGui:FindFirstChild("StaminaGui")
    if not staminaScreenGui or not staminaScreenGui:IsA("ScreenGui") then return nil end
    
    local mainFrame = staminaScreenGui:FindFirstChild("MainFrame")
    if not mainFrame or not mainFrame:IsA("Frame") then return nil end
    
    local progressBar = mainFrame:FindFirstChild("ProgressBar")
    if not progressBar or not progressBar:IsA("Frame") then return nil end
    
    local fillElement = progressBar:FindFirstChild("Fill")
    if not fillElement or not fillElement:IsA("GuiObject") then return nil end
    
    return fillElement
end

local function updateGuiBar(staminaRatio)
    local fill = getStaminaGuiFill()
    if fill then
        fill.Size = UDim2.new(math.clamp(staminaRatio, 0, 1), 0, 1, 0)
    end
end

local function setSprintState(active)
    local char, hum, hrp = getActiveCharacterParts()
    if not hum then return end

    if active and currentStamina > 10 then
        isSprinting = true
        hum.WalkSpeed = SPRINT_SPEED
    else
        isSprinting = false
        hum.WalkSpeed = DEFAULT_SPEED
    end
end

UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end
    if input.KeyCode == Enum.KeyCode.LeftShift then
        setSprintState(true)
    end
end)

UserInputService.InputEnded:Connect(function(input)
    if input.KeyCode == Enum.KeyCode.LeftShift then
        setSprintState(false)
    end
end)

task.spawn(function()
    while true do
        task.wait(0.1)
        local char, hum, hrp = getActiveCharacterParts()
        
        -- Safe check: only compute movement if HumanoidRootPart and Humanoid exist
        if hum and hrp and isSprinting and hum.MoveDirection.Magnitude > 0 then
            currentStamina = math.max(0, currentStamina - 2)
            if currentStamina <= 0 then
                setSprintState(false)
            end
        else
            currentStamina = math.min(STAMINA_MAX, currentStamina + 1)
        end
        
        updateGuiBar(currentStamina / STAMINA_MAX)
    end
end)
`
  },
  {
    id: 'executor_test_fixture',
    name: 'Executor Environment Compatibility Fixture',
    profile: 'executor_ext',
    description: 'Script with nonstandard executor hooks to demonstrate static profile analysis and warnings.',
    code: `-- Nonstandard Executor Environment Script
-- WARNING: This script uses third-party executor hooks not supported by Roblox Studio!
local genv = getgenv and getgenv() or {}
genv.CustomConfig = {
    AutoFarm = true,
    TargetMob = "DesertBandit",
    Delay = 0.5
}

local function notifyUser(text)
    if rconsoleprint then
        rconsoleprint("[Aegis Notice] " .. tostring(text) .. "\\n")
    else
        print("[Notice] " .. tostring(text))
    end
end

if hookfunction then
    notifyUser("Hookfunction detected in environment.")
else
    notifyUser("Standard environment runtime.")
end

local function triggerAction()
    local detector = workspace:FindFirstChild("TestPrompt")
    if detector and fireproximityprompt then
        fireproximityprompt(detector)
    end
end

triggerAction()
`
  }
];
