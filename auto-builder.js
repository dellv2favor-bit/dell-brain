#!/usr/bin/env node
/**
 * Dell Auto-Builder
 *
 * Runs daily. Analyzes recent conversations for patterns,
 * identifies automation opportunities, builds solutions,
 * pushes to GitHub, and reports back via WhatsApp.
 *
 * Flow: observe → identify → build → ship → report
 */

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Paths
const BOT_DIR = '/root/whatsapp-bot';
const BRAIN_DIR = '/root/dell-brain';
const DB_PATH = path.join(BOT_DIR, 'data', 'favor.db');
const BACKLOG_PATH = path.join(BRAIN_DIR, 'ideas', 'backlog.json');
const CONFIG_PATH = path.join(BOT_DIR, 'config.json');

// How many days of conversations to analyze
const LOOKBACK_DAYS = 7;
// Min times a pattern must appear to be worth building
const PATTERN_THRESHOLD = 3;
// Max builds per session
const MAX_BUILDS = 1;

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function getRecentConversations() {
  if (!fs.existsSync(DB_PATH)) {
    log('Database not found');
    return [];
  }

  const db = new Database(DB_PATH, { readonly: true });
  const cutoff = Date.now() - (LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Get recent sessions
  const sessions = db.prepare(`
    SELECT contact, messages, updated_at FROM sessions
    WHERE updated_at > ?
  `).all(cutoff);

  // Get recent memories for context
  const memories = db.prepare(`
    SELECT category, content FROM memories
    WHERE created_at > ?
    ORDER BY created_at DESC LIMIT 100
  `).all(cutoff);

  // Get router telemetry to see what routes are used most
  let telemetry = [];
  try {
    telemetry = db.prepare(`
      SELECT route, count(*) as cnt FROM router_telemetry
      WHERE timestamp > ?
      GROUP BY route ORDER BY cnt DESC
    `).all(cutoff);
  } catch {}


  db.close();

  return { sessions, memories, telemetry };
}

function extractUserMessages(sessions) {
  const messages = [];
  for (const s of sessions) {
    try {
      const msgs = JSON.parse(s.messages);
      for (const m of msgs) {
        if (m.role === 'user' && typeof m.content === 'string') {
          messages.push({
            contact: s.contact,
            text: m.content,
            time: s.updated_at
          });
        }
      }
    } catch {}
  }
  return messages;
}

function analyzePatterns(userMessages) {
  // Use Claude CLI to analyze patterns — it's free via Max subscription
  const sample = userMessages
    .slice(-200)
    .map(m => `[${m.contact}]: ${m.text}`)
    .join('\n');

  if (sample.length < 100) {
    log('Not enough conversation data to analyze');
    return null;
  }

  const prompt = `You are Dell's auto-builder. Analyze these recent WhatsApp conversations and identify:

1. REPEATED REQUESTS — things the user asks for more than ${PATTERN_THRESHOLD} times
2. MANUAL WORKFLOWS — multi-step processes that could be automated
3. MISSING TOOLS — capabilities the user seems to want but Dell doesn't have
4. FRICTION POINTS — things that take too long or require too many back-and-forth messages

For each pattern found, suggest a SPECIFIC, SMALL tool/script that would solve it.

Respond in JSON format:
{
  "patterns": [
    {
      "type": "repeated_request|manual_workflow|missing_tool|friction_point",
      "description": "What the pattern is",
      "frequency": "How often it occurs (estimate)",
      "solution": "Specific tool/script to build",
      "complexity": "small|medium|large",
      "impact": "high|medium|low",
      "filename": "suggested-filename.js"
    }
  ]
}

Only include patterns where you're confident a small automation would help.
If nothing stands out, return {"patterns": []}.
Quality over quantity — 1 great idea beats 5 mediocre ones.

Recent conversations:
${sample}`;

  const tmpPrompt = '/tmp/dell-builder-prompt.txt';
  fs.writeFileSync(tmpPrompt, prompt);

  try {
    const result = execSync(
      `claude -p "$(cat ${tmpPrompt})" --output-format json 2>/dev/null`,
      { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    ).toString();

    // Parse Claude's response — extract JSON from the result
    const parsed = JSON.parse(result);
    const text = parsed.result || parsed.content || result;

    // Find JSON in the response
    const jsonMatch = text.match(/\{[\s\S]*"patterns"[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    log('Could not parse pattern analysis');
    return null;
  } catch (e) {
    log(`Pattern analysis failed: ${e.message}`);
    return null;
  }
}

function updateBacklog(analysis) {
  const backlog = JSON.parse(fs.readFileSync(BACKLOG_PATH, 'utf8'));
  const existingDescs = new Set(backlog.ideas.map(i => i.description));

  let added = 0;
  for (const pattern of analysis.patterns) {
    // Skip duplicates
    if (existingDescs.has(pattern.description)) continue;

    // Prioritize: high impact + small complexity first
    const priority =
      (pattern.impact === 'high' ? 3 : pattern.impact === 'medium' ? 2 : 1) *
      (pattern.complexity === 'small' ? 3 : pattern.complexity === 'medium' ? 2 : 1);

    backlog.ideas.push({
      ...pattern,
      priority,
      status: 'pending',
      identified: new Date().toISOString(),
      built: null
    });
    added++;
  }

  // Sort by priority descending
  backlog.ideas.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  backlog.last_scan = new Date().toISOString();

  fs.writeFileSync(BACKLOG_PATH, JSON.stringify(backlog, null, 2));
  log(`Added ${added} new ideas to backlog (${backlog.ideas.length} total)`);

  return backlog;
}

function pickNextBuild(backlog) {
  return backlog.ideas.find(i => i.status === 'pending' && i.complexity === 'small')
    || backlog.ideas.find(i => i.status === 'pending');
}

function buildTool(idea) {
  log(`Building: ${idea.solution}`);

  const category = idea.type === 'manual_workflow' ? 'automations'
    : idea.type === 'missing_tool' ? 'tools'
    : 'scripts';

  const buildDir = path.join(BRAIN_DIR, 'builds', category);
  const filename = idea.filename || 'tool.js';
  const filepath = path.join(buildDir, filename);

  const buildPrompt = `Build this tool for Dell (an AI WhatsApp bot agent):

WHAT TO BUILD: ${idea.solution}
WHY: ${idea.description} (happens ${idea.frequency})
FILENAME: ${filename}

Requirements:
- Single file, Node.js, minimal dependencies (prefer built-in modules)
- Include a clear header comment explaining what it does and why Dell built it
- Export a main function or class that can be imported by Dell's bot (favor.js)
- Include a CLI mode (if run directly) for testing
- Keep it under 200 lines — simple and focused
- No API keys hardcoded — read from /root/whatsapp-bot/config.json if needed

Output ONLY the code, no explanation.`;

  try {
    const result = execSync(
      `claude -p ${JSON.stringify(buildPrompt)} --output-format json 2>/dev/null`,
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
    ).toString();

    const parsed = JSON.parse(result);
    let code = parsed.result || parsed.content || result;

    // Strip markdown code fences if present
    code = code.replace(/^```(?:javascript|js)?\n?/m, '').replace(/\n?```$/m, '').trim();

    fs.writeFileSync(filepath, code);
    log(`Built: ${filepath} (${code.split('\n').length} lines)`);

    // Write a README for this build
    const readme = `# ${filename}\n\n**Built by Dell on ${new Date().toISOString().split('T')[0]}**\n\n## Why\n${idea.description} (${idea.frequency})\n\n## What it does\n${idea.solution}\n\n## Pattern type\n${idea.type} | Impact: ${idea.impact} | Complexity: ${idea.complexity}\n`;
    fs.writeFileSync(filepath.replace(/\.js$/, '.README.md'), readme);

    return { success: true, filepath, category };
  } catch (e) {
    log(`Build failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

function gitPush(idea) {
  try {
    execSync('git add -A', { cwd: BRAIN_DIR });
    const msg = `auto-build: ${idea.filename || 'new tool'} — ${idea.solution.substring(0, 60)}`;
    execSync(`git commit -m "${msg}"`, { cwd: BRAIN_DIR });
    execSync('git push origin main 2>&1', { cwd: BRAIN_DIR, timeout: 30000 });
    log('Pushed to GitHub');
    return true;
  } catch (e) {
    log(`Git push failed: ${e.message}`);
    return false;
  }
}

function reportToWhatsApp(idea, buildResult) {
  // Write to the sync state so Dell picks it up
  const stateDir = path.join(BOT_DIR, 'state');
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });

  const report = {
    type: 'auto_build',
    timestamp: new Date().toISOString(),
    idea: idea.description,
    solution: idea.solution,
    result: buildResult.success ? 'built and pushed' : 'failed',
    repo: `https://github.com/dellv2favor-bit/dell-brain/tree/main/builds/${buildResult.category}`,
    filepath: buildResult.filepath
  };

  fs.writeFileSync(
    path.join(stateDir, 'last_build.json'),
    JSON.stringify(report, null, 2)
  );

  // Also try to send WhatsApp message via the bot's send mechanism
  // We write to a "pending_messages" file that favor.js can pick up
  const pendingDir = path.join(BOT_DIR, 'state', 'pending');
  if (!fs.existsSync(pendingDir)) fs.mkdirSync(pendingDir, { recursive: true });

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const operatorJid = config.operator?.jid || config.ownerJid;

  if (operatorJid) {
    const notification = {
      to: operatorJid,
      message: buildResult.success
        ? `hey, i noticed you ${idea.description.toLowerCase()}. so i built something for it:\n\n*${idea.solution}*\n\nit's in my repo: github.com/dellv2favor-bit/dell-brain\n\nwant me to plug it into my toolkit?`
        : `i tried to build something for "${idea.description}" but hit an issue. i'll try again next session.`,
      timestamp: Date.now()
    };

    const msgFile = path.join(pendingDir, `build_${Date.now()}.json`);
    fs.writeFileSync(msgFile, JSON.stringify(notification, null, 2));
    log(`Queued WhatsApp notification for operator`);
  }
}

function writeLog(idea, buildResult) {
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(BRAIN_DIR, 'logs', `${date}.md`);

  const entry = `\n## ${new Date().toISOString()}\n\n**Pattern:** ${idea.description}\n**Type:** ${idea.type} | Frequency: ${idea.frequency}\n**Solution:** ${idea.solution}\n**Result:** ${buildResult.success ? 'Built and pushed' : 'Failed: ' + buildResult.error}\n**File:** ${buildResult.filepath || 'N/A'}\n`;

  const existing = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : `# Dell Auto-Builder Log — ${date}\n`;
  fs.writeFileSync(logFile, existing + entry);
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  log('=== Dell Auto-Builder starting ===');

  // Step 1: Observe
  log('Step 1: Gathering recent conversations...');
  const data = getRecentConversations();
  if (!data.sessions?.length) {
    log('No recent conversations found. Exiting.');
    return;
  }
  log(`Found ${data.sessions.length} sessions, ${data.memories.length} memories`);

  const userMessages = extractUserMessages(data.sessions);
  log(`Extracted ${userMessages.length} user messages`);

  if (userMessages.length < 10) {
    log('Not enough messages to analyze. Exiting.');
    return;
  }

  // Step 2: Identify
  log('Step 2: Analyzing patterns...');
  const analysis = analyzePatterns(userMessages);
  if (!analysis?.patterns?.length) {
    log('No actionable patterns found. Exiting.');
    return;
  }
  log(`Found ${analysis.patterns.length} patterns`);

  // Step 3: Update backlog
  const backlog = updateBacklog(analysis);

  // Step 4: Pick and build
  const nextBuild = pickNextBuild(backlog);
  if (!nextBuild) {
    log('No pending builds. Exiting.');
    gitPush({ filename: 'backlog-update', solution: 'updated pattern backlog' });
    return;
  }

  log(`Step 3: Building — ${nextBuild.solution}`);
  const buildResult = buildTool(nextBuild);

  // Update backlog status
  nextBuild.status = buildResult.success ? 'built' : 'failed';
  nextBuild.built = new Date().toISOString();
  fs.writeFileSync(BACKLOG_PATH, JSON.stringify(backlog, null, 2));

  // Step 5: Ship
  if (buildResult.success) {
    log('Step 4: Pushing to GitHub...');
    gitPush(nextBuild);
  }

  // Step 6: Report
  log('Step 5: Reporting...');
  writeLog(nextBuild, buildResult);
  reportToWhatsApp(nextBuild, buildResult);

  log('=== Auto-builder session complete ===');
}

main().catch(e => {
  log(`Fatal error: ${e.message}`);
  process.exit(1);
});
