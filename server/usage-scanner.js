/**
 * Scan OpenClaw session logs for usage data
 * Extracts token counts and costs from JSONL session files
 *
 * Uses a TTL cache (5 min) to avoid re-reading all JSONL files on every request.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw/agents/main/sessions');

// --- Cache layer ---
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let todayCache = { data: null, expires: 0 };
let weeklyCache = { data: null, expires: 0 };

async function scanSessionFile(filePath) {
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    messageCount: 0
  };

  try {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'message' && entry.message?.usage) {
          const u = entry.message.usage;
          usage.inputTokens += u.input || 0;
          usage.outputTokens += u.output || 0;
          usage.cacheRead += u.cacheRead || 0;
          usage.cacheWrite += u.cacheWrite || 0;
          usage.totalTokens += u.totalTokens || 0;
          if (u.cost?.total) {
            usage.totalCost += u.cost.total;
          }
          usage.messageCount++;
        }
      } catch (e) {
        // Skip malformed lines
      }
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
  }

  return usage;
}

async function scanAndAggregate(sessionPaths) {
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    messageCount: 0,
    sessionCount: sessionPaths.length
  };

  for (const sessionPath of sessionPaths) {
    const usage = await scanSessionFile(sessionPath);
    totals.inputTokens += usage.inputTokens;
    totals.outputTokens += usage.outputTokens;
    totals.cacheRead += usage.cacheRead;
    totals.cacheWrite += usage.cacheWrite;
    totals.totalTokens += usage.totalTokens;
    totals.totalCost += usage.totalCost;
    totals.messageCount += usage.messageCount;
  }

  return totals;
}

function listSessionFiles(filter) {
  const sessions = [];
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(SESSIONS_DIR, file);
      const stats = fs.statSync(filePath);
      if (filter(stats)) {
        sessions.push(filePath);
      }
    }
  } catch (e) {
    console.error('Error listing sessions:', e.message);
  }
  return sessions;
}

async function getTodayUsage() {
  const now = Date.now();
  if (todayCache.data && now < todayCache.expires) {
    return todayCache.data;
  }

  const today = new Date().toISOString().split('T')[0];
  const sessions = listSessionFiles((stats) => {
    return stats.mtime.toISOString().split('T')[0] === today;
  });

  const totals = await scanAndAggregate(sessions);
  todayCache = { data: totals, expires: now + CACHE_TTL_MS };
  return totals;
}

async function getWeeklyUsage() {
  const now = Date.now();
  if (weeklyCache.data && now < weeklyCache.expires) {
    return weeklyCache.data;
  }

  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const sessions = listSessionFiles((stats) => stats.mtime >= weekAgo);

  const totals = await scanAndAggregate(sessions);
  weeklyCache = { data: totals, expires: now + CACHE_TTL_MS };
  return totals;
}

module.exports = { getTodayUsage, getWeeklyUsage, scanSessionFile };
