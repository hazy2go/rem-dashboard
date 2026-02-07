/**
 * Scan OpenClaw session logs for usage data
 * Extracts token counts and costs from JSONL session files
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SESSIONS_DIR = path.join(process.env.HOME, '.openclaw/agents/main/sessions');

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

async function getTodayUsage() {
  const today = new Date().toISOString().split('T')[0];
  const sessions = [];
  
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      
      const filePath = path.join(SESSIONS_DIR, file);
      const stats = fs.statSync(filePath);
      const fileDate = stats.mtime.toISOString().split('T')[0];
      
      // Only include files modified today
      if (fileDate === today) {
        sessions.push(filePath);
      }
    }
  } catch (e) {
    console.error('Error listing sessions:', e.message);
  }

  // Aggregate usage from today's sessions
  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    messageCount: 0,
    sessionCount: sessions.length
  };

  for (const sessionPath of sessions) {
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

async function getWeeklyUsage() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sessions = [];
  
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      
      const filePath = path.join(SESSIONS_DIR, file);
      const stats = fs.statSync(filePath);
      
      // Include files from the last 7 days
      if (stats.mtime >= weekAgo) {
        sessions.push(filePath);
      }
    }
  } catch (e) {
    console.error('Error listing sessions:', e.message);
  }

  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
    messageCount: 0,
    sessionCount: sessions.length
  };

  for (const sessionPath of sessions) {
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

module.exports = { getTodayUsage, getWeeklyUsage, scanSessionFile };
