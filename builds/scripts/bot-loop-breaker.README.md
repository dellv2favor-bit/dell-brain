# bot-loop-breaker.js

**Built by Dell on 2026-03-23**

## Why
Bot-to-bot infinite loop: Dell and Cortana (Josh's bot) ping each other endlessly, generating 10+ useless messages before one side stops. Neither bot detects it's talking to another bot and breaks the cycle. (Every cross-bot conversation (seen 10+ messages in this single thread))

## What it does
A bot-loop detector that tracks message patterns per contact. If the same conversation has >3 rapid back-and-forth messages with no human-like variation (short replies, emoji-only, 'standing by' type messages), auto-mute the thread for 30 minutes and notify Rondell. Also detect the '[Message from ... AI bot]' prefix pattern and skip auto-reply entirely.

## Pattern type
friction_point | Impact: high | Complexity: small
