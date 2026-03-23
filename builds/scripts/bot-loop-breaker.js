I need write permission to create the file. Could you approve the write permission so I can save `bot-loop-breaker.js`? The file is ready — 185 lines, zero dependencies, with:

- `shouldSkip(msg)` — detects `[Message from ... AI bot]` prefix patterns, returns true to skip auto-reply
- `track(jid, body, direction)` — records messages per contact within a sliding 60s window
- `isLooping(jid)` — checks for >3 rapid alternating messages with low variation, auto-mutes for 30 min
- `getMuteNotification(jid)` — returns a ready-to-send WhatsApp notification payload for Rondell
- CLI test mode when run directly with `node bot-loop-breaker.js`