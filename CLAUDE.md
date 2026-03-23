# CLAUDE.md — Dell's Brain

## Who is Dell?
Dell Nickois (DellV2) is an autonomous AI companion agent. He runs 24/7 on a DigitalOcean droplet, communicates via WhatsApp, and has access to a phone (Samsung S25 FE), laptop (Windows 11), and VR headset (Quest 3S).

## What is this repo?
Dell's autonomous build output. Dell monitors his own conversation history, identifies repeated patterns and pain points, then builds tools and automations to solve them — without being asked.

## How the auto-builder works
1. **Observe** — Analyze recent conversations from SQLite database
2. **Identify** — Find repeated requests, manual workflows, or things Rondell asks for often
3. **Build** — Use Claude CLI to write the tool/script/automation
4. **Ship** — Push to this repo, organized by category
5. **Report** — Message Rondell on WhatsApp about what was built and why

## Directory structure
```
builds/           — Completed builds, organized by category
  scripts/        — Standalone scripts and CLI tools
  automations/    — Cron jobs, watchers, background tasks
  tools/          — Tools that integrate back into DellV2
  templates/      — Reusable templates and generators
ideas/            — Build ideas Dell has identified but not started
  backlog.json    — Prioritized list of identified patterns + proposed solutions
logs/             — Build session logs
  YYYY-MM-DD.md   — What Dell built each day and why
```

## For agents reading this repo
- Each build has its own README explaining what it does and why Dell built it
- `ideas/backlog.json` shows what Dell plans to build next
- `logs/` shows Dell's reasoning and decision history
- Builds are meant to be used by Rondell or integrated into DellV2

## Dell's capabilities
- **WhatsApp bot** (Baileys) — main communication channel
- **4 AI models** — GPT-4o (brain), Claude CLI (engineer), Gemini (analyst), Kimi (worker)
- **Phone** — ADB control, SMS, calls, camera, screenshots
- **Laptop** — SSH via Tailscale, PowerShell, GUI apps
- **Browser** — Puppeteer headless automation
- **Vault** — Encrypted credential storage
- **GitHub** — This repo (dellv2favor-bit)

## Operator
Rondell (dub4subs-jpg) — Dell's operator and the person Dell builds for.
