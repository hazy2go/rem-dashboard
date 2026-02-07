const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { getTodayUsage, getWeeklyUsage } = require('./usage-scanner');

// ── Auto-detect Rem activity from session transcript ──────────────────

const SESSIONS_DIR = path.join(os.homedir(), '.openclaw/agents/main/sessions');
const SESSIONS_JSON = path.join(SESSIONS_DIR, 'sessions.json');

// Friendly labels for OpenClaw tool names
const TOOL_LABELS = {
  exec: 'Running shell command',
  read: 'Reading file',
  edit: 'Editing file',
  write: 'Writing file',
  browser: 'Browsing web',
  web_fetch: 'Fetching web page',
  process: 'Managing sub-agent',
  gateway: 'Sending notification',
  message: 'Sending message',
  cron: 'Managing cron job',
  sessions_spawn: 'Spawning session',
  sessions_list: 'Listing sessions',
  sessions_history: 'Reading history',
  session_status: 'Checking session',
};

let activityWatcher = null;
let watchedSessionId = null;
let watchedFilePath = null;
let lastDetectedActivity = null;
let lastActivityTime = Date.now();
let idleTimer = null;

// Resolve current main session transcript path
function getMainTranscriptPath() {
  try {
    const sessions = JSON.parse(fs.readFileSync(SESSIONS_JSON, 'utf8'));
    const main = sessions['agent:main:main'];
    if (!main?.sessionId) return null;
    return { sessionId: main.sessionId, filePath: path.join(SESSIONS_DIR, main.sessionId + '.jsonl') };
  } catch (e) {
    return null;
  }
}

// Read tail of JSONL and extract latest activity
function detectActivity(filePath) {
  try {
    const stat = fs.statSync(filePath);
    // Read last ~8KB to get recent entries
    const bufSize = Math.min(stat.size, 8192);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(bufSize);
    fs.readSync(fd, buf, 0, bufSize, stat.size - bufSize);
    fs.closeSync(fd);

    const chunk = buf.toString('utf8');
    // Find complete lines (skip partial first line)
    const firstNewline = chunk.indexOf('\n');
    if (firstNewline === -1) return null;
    const lines = chunk.slice(firstNewline + 1).trim().split('\n');

    // Walk backwards to find latest meaningful entry
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.type !== 'message') continue;
        const msg = obj.message;
        if (!msg) continue;

        if (msg.role === 'assistant') {
          const content = msg.content || [];
          // Check for tool use first (most specific)
          const toolUse = content.find(c => c.type === 'tool_use');
          if (toolUse) {
            const label = TOOL_LABELS[toolUse.name] || `Using ${toolUse.name}`;
            return { activity: label, tool: toolUse.name, timestamp: obj.timestamp };
          }
          // Thinking or text response
          const hasThinking = content.some(c => c.type === 'thinking');
          if (hasThinking) return { activity: 'Thinking...', timestamp: obj.timestamp };
          const hasText = content.some(c => c.type === 'text');
          if (hasText) return { activity: 'Responding to user', timestamp: obj.timestamp };
        }

        if (msg.role === 'toolResult') {
          const label = TOOL_LABELS[msg.toolName] || `Using ${msg.toolName}`;
          return { activity: label, tool: msg.toolName, timestamp: obj.timestamp };
        }

        if (msg.role === 'user') {
          return { activity: 'Processing user message', timestamp: obj.timestamp };
        }
      } catch (e) { /* skip malformed line */ }
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Apply detected activity to agent state + broadcast
function applyActivity(activity) {
  if (!activity) return;

  lastActivityTime = Date.now();
  const desc = activity.activity;

  // Only update if activity changed
  if (desc === lastDetectedActivity) return;
  lastDetectedActivity = desc;

  const current = readAgentState();
  // Only overwrite if current task was also auto-detected (or is Idle)
  // This preserves manually-set task descriptions from POST /api/agent
  if (current.autoDetected || current.currentTask === 'Idle') {
    const newState = { ...current, currentTask: desc, autoDetected: true };
    fs.writeFileSync(AGENT_STATE_FILE, JSON.stringify(newState, null, 2));
    broadcast('agent', { ...newState, name: 'REM' });
  }

  // Reset idle timer
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    lastDetectedActivity = 'Idle';
    const state = readAgentState();
    if (state.currentTask !== 'Idle') {
      const updated = updateAgentState({ currentTask: 'Idle', autoDetected: true });
      broadcast('agent', { ...updated, name: 'REM' });
    }
  }, 60000);
}

// Start (or restart) watching the active session transcript
function startTranscriptWatcher() {
  const info = getMainTranscriptPath();
  if (!info || !fs.existsSync(info.filePath)) return;

  // Already watching the right file
  if (info.sessionId === watchedSessionId && activityWatcher) return;

  // Clean up old watcher
  if (activityWatcher) {
    activityWatcher.close();
    activityWatcher = null;
  }

  watchedSessionId = info.sessionId;
  watchedFilePath = info.filePath;

  // Debounce: coalesce rapid writes
  let debounceTimer = null;
  activityWatcher = fs.watch(info.filePath, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const activity = detectActivity(watchedFilePath);
      applyActivity(activity);
    }, 500);
  });

  activityWatcher.on('error', () => {
    activityWatcher = null;
    watchedSessionId = null;
  });

  // Do an initial read
  const activity = detectActivity(info.filePath);
  applyActivity(activity);

  console.log(`Watching session transcript: ${info.sessionId.slice(0, 8)}...`);
}

// Re-check session ID periodically (handles new sessions)
setInterval(() => {
  startTranscriptWatcher();
}, 10000);

// ── End auto-detect ───────────────────────────────────────────────────

// Cached Claude usage from codexbar
let cachedClaudeUsage = null;
let lastClaudeUpdate = 0;

// Get real Claude usage from codexbar (non-blocking)
function getClaudeUsage() {
  const now = Date.now();
  if (now - lastClaudeUpdate > 60000) { // Refresh every 60s
    lastClaudeUpdate = now;
    const { exec } = require('child_process');
    exec('codexbar usage --provider claude --json 2>/dev/null', { timeout: 15000 }, (err, stdout) => {
      if (!err && stdout) {
        try {
          const data = JSON.parse(stdout);
          if (data[0]?.usage) {
            cachedClaudeUsage = data[0].usage;
          }
        } catch (e) {}
      }
    });
  }
  return cachedClaudeUsage;
}

// Get OpenClaw context window usage from session files
function getContextUsage() {
  try {
    // Read sessions.json to find main session
    const sessionsPath = path.join(os.homedir(), '.openclaw/agents/main/sessions/sessions.json');
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
    const mainSession = sessions['agent:main:main'];
    
    if (!mainSession) return { contextUsed: 0, contextLimit: 200000, contextPercent: 0, model: 'claude-opus-4-5' };
    
    // Read the transcript to get last usage
    const transcriptPath = path.join(os.homedir(), '.openclaw/agents/main/sessions', mainSession.sessionId + '.jsonl');
    if (!fs.existsSync(transcriptPath)) return { contextUsed: 0, contextLimit: 200000, contextPercent: 0, model: 'claude-opus-4-5' };
    
    // Read last few lines for usage
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n').slice(-20);
    
    let lastUsage = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.message?.usage?.totalTokens) {
          lastUsage = obj.message.usage;
          break;
        }
      } catch (e) {}
    }
    
    // Calculate context from usage - input + cacheRead is roughly the context
    const contextUsed = lastUsage ? (lastUsage.input || 0) + (lastUsage.cacheRead || 0) + (lastUsage.cacheWrite || 0) + (lastUsage.output || 0) : 0;
    const contextLimit = 200000;
    const contextPercent = Math.round((contextUsed / contextLimit) * 100);
    
    return {
      contextUsed,
      contextLimit,
      contextPercent,
      model: 'claude-opus-4-5'
    };
  } catch (e) {
    console.error('Error reading context:', e.message);
    return { contextUsed: 0, contextLimit: 200000, contextPercent: 0, model: 'claude-opus-4-5' };
  }
}

// Cached sub-agents
let cachedSubAgents = [];
let lastSubAgentUpdate = 0;

// Get sub-agents from OpenClaw sessions
function getSubAgents() {
  const now = Date.now();
  if (now - lastSubAgentUpdate > 5000) { // Refresh every 5s
    lastSubAgentUpdate = now;
    
    try {
      const sessionsPath = path.join(os.homedir(), '.openclaw/agents/main/sessions/sessions.json');
      if (!fs.existsSync(sessionsPath)) return cachedSubAgents;
      
      const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8'));
      const subAgents = [];
      
      for (const [key, session] of Object.entries(sessions)) {
        // Match subagent sessions: agent:main:subagent:*
        if (key.includes(':subagent:')) {
          // updatedAt is epoch ms - use to determine if session is stale
          const updatedAt = session.updatedAt || 0;
          const idleMs = now - updatedAt;
          
          // Skip if not updated in last 30 seconds - likely done
          if (idleMs > 30000) continue;
          
          const label = session.label || key.split(':').pop().slice(0, 8);
          const ageSeconds = Math.round(idleMs / 1000);
          
          subAgents.push({
            id: key,
            label: label,
            status: 'running',
            task: session.task || session.label || 'Unknown task',
            model: session.model || 'unknown',
            updatedAt: new Date(updatedAt).toISOString(),
            age: formatUptime(ageSeconds)
          });
        }
      }
      
      // Sort by update time, newest first, limit to 5
      subAgents.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      cachedSubAgents = subAgents.slice(0, 5);
    } catch (e) {
      console.error('Error reading sub-agents:', e.message);
    }
  }
  return cachedSubAgents;
}

const app = express();
const PORT = 3001;

// SSE clients for real-time updates
const sseClients = new Set();

// Broadcast to all SSE clients
function broadcast(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(message);
  }
}

// Enable CORS for localhost:3000
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Data file paths
const ACTIVITY_FILE = path.join(os.homedir(), '.openclaw/workspace/rem-activity.json');
const TOKENS_FILE = path.join(os.homedir(), '.openclaw/workspace/rem-tokens.json');
const AGENT_STATE_FILE = path.join(os.homedir(), '.openclaw/workspace/rem-agent-state.json');

// Read agent state
function readAgentState() {
  try {
    if (fs.existsSync(AGENT_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(AGENT_STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return { status: 'active', currentTask: 'Idle', lastTask: 'Starting up', lastTaskTime: 'just now' };
}

// Update agent state and log to activity
function updateAgentState(updates) {
  const current = readAgentState();
  const taskChanged = updates.currentTask && updates.currentTask !== current.currentTask;
  
  // If task changed, move current to last
  if (taskChanged && current.currentTask && current.currentTask !== 'Idle') {
    updates.lastTask = current.currentTask;
    updates.lastTaskTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    // Log the change
    addActivity('REM', updates.currentTask, 'info');
  }
  
  const newState = { ...current, ...updates };
  fs.writeFileSync(AGENT_STATE_FILE, JSON.stringify(newState, null, 2));
  return newState;
}

// Helper to add activity entry
function addActivity(agent, message, type = 'info') {
  try {
    const activities = readJsonFile(ACTIVITY_FILE);
    const newEntry = {
      timestamp: new Date().toISOString(),
      type,
      agent,
      message
    };
    activities.unshift(newEntry); // Add to beginning
    // Keep only last 50 entries
    const trimmed = activities.slice(0, 50);
    fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(trimmed, null, 2));
    return true;
  } catch (e) {
    console.error('Error adding activity:', e.message);
    return false;
  }
}

// POST endpoint to add activity
app.post('/api/activity', (req, res) => {
  const { agent, message, type } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message required' });
  }
  addActivity(agent || 'SYSTEM', message, type || 'info');
  
  // Broadcast activity update to all SSE clients
  const activities = readJsonFile(ACTIVITY_FILE);
  broadcast('activity', activities.slice(0, 12));
  
  res.json({ ok: true });
});

// POST endpoint to update agent state
app.post('/api/agent', (req, res) => {
  const { currentTask, status } = req.body;
  // Manual POST clears autoDetected flag so auto-detect won't overwrite
  const newState = updateAgentState({ currentTask, status, autoDetected: false });

  // Broadcast agent state update to all SSE clients
  broadcast('agent', newState);

  res.json({ ok: true, state: newState });
});

// SSE endpoint for real-time updates
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:3000',
  });
  
  // Send initial connection message
  res.write(`event: connected\ndata: {"time":"${new Date().toISOString()}"}\n\n`);
  
  // Add to clients set
  sseClients.add(res);
  console.log(`SSE client connected (${sseClients.size} total)`);
  
  // Send heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: {"time":"${new Date().toISOString()}"}\n\n`);
  }, 30000);
  
  // Remove on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    console.log(`SSE client disconnected (${sseClients.size} remaining)`);
  });
});

// GET endpoint for agent state
app.get('/api/agent', (req, res) => {
  res.json(readAgentState());
});

// Helper function to read JSON file safely
function readJsonFile(filePath, defaultValue = []) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
  }
  return defaultValue;
}

// Helper function to get system stats
function getSystemStats() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  
  const cpus = os.cpus();
  const loadAvgArr = os.loadavg();
  
  // Calculate memory pressure (macOS-style)
  // Use load average as a proxy for system pressure (more meaningful on macOS)
  const loadRatio = loadAvgArr[0] / cpus.length;
  
  let pressure = '💚 Low';
  let pressureColor = '#7ecba1'; // green
  if (loadRatio > 1.5) {
    pressure = '💗 High';
    pressureColor = '#f4a6c1'; // pink/red
  } else if (loadRatio > 0.7) {
    pressure = '💛 Medium'; 
    pressureColor = '#f7c97e'; // yellow
  }
  const memoryUsagePercent = (usedMemory / totalMemory * 100).toFixed(1);
  
  return {
    memory: {
      total: Math.round(totalMemory / (1024 * 1024 * 1024) * 100) / 100, // GB
      used: Math.round(usedMemory / (1024 * 1024 * 1024) * 100) / 100, // GB
      free: Math.round(freeMemory / (1024 * 1024 * 1024) * 100) / 100, // GB
      usagePercent: parseFloat(memoryUsagePercent),
      pressure: pressure,
      pressureColor: pressureColor
    },
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      loadAvg: {
        '1min': Math.round(loadAvgArr[0] * 100) / 100,
        '5min': Math.round(loadAvgArr[1] * 100) / 100,
        '15min': Math.round(loadAvgArr[2] * 100) / 100
      }
    },
    uptime: Math.round(os.uptime()),
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname()
  };
}

// Cached cron jobs (refresh separately to avoid blocking)
let cachedCronJobs = [];
let lastCronUpdate = 0;

// Helper function to get OpenClaw cron jobs
function getCronJobs(forceRefresh = false) {
  const now = Date.now();
  if (forceRefresh || now - lastCronUpdate > 5000) {
    lastCronUpdate = now;
    
    // Define our launchd jobs with interval info for calculating next run
    const launchdJobs = [
      { id: 'video-mirror', name: 'video-mirror', schedule: 'Every 5m', label: 'com.openclaw.video-mirror', intervalMs: 5 * 60 * 1000 },
      { id: 'qmd-update', name: 'qmd-update', schedule: 'Every 5m', label: 'com.openclaw.qmd-update', intervalMs: 5 * 60 * 1000 },
      { id: 'daily-backup', name: 'daily-backup', schedule: '4:00 AM', label: 'com.openclaw.daily-backup', calendarHour: 4 },
      { id: 'memory-cleanup', name: 'memory-cleanup', schedule: 'Every 6h', label: 'com.openclaw.memory-cleanup', calendarHours: [0, 6, 12, 18] }
    ];
    
    const jobs = [];
    const formatTime = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    try {
      // Get launchd status
      const launchctlOutput = execSync('launchctl list 2>/dev/null || true', { encoding: 'utf8' });
      
      for (const job of launchdJobs) {
        // Check if job is loaded in launchd
        const isLoaded = launchctlOutput.includes(job.label);
        
        // Check log file for last run time
        let lastRun = '—';
        let lastRunMs = null;
        const logFile = `/tmp/${job.id}.log`;
        try {
          if (fs.existsSync(logFile)) {
            const stat = fs.statSync(logFile);
            lastRunMs = stat.mtime.getTime();
            lastRun = formatTime(stat.mtime);
          }
        } catch (e) {}
        
        // Calculate next run time
        let nextRun = '—';
        const nowDate = new Date();
        
        if (job.intervalMs && lastRunMs) {
          // Interval-based: next = last + interval
          const nextMs = lastRunMs + job.intervalMs;
          if (nextMs > now) {
            nextRun = formatTime(new Date(nextMs));
          } else {
            // Overdue, next run is basically now
            nextRun = 'soon';
          }
        } else if (job.calendarHour !== undefined) {
          // Daily at specific hour
          const next = new Date(nowDate);
          next.setHours(job.calendarHour, 0, 0, 0);
          if (next <= nowDate) next.setDate(next.getDate() + 1);
          nextRun = formatTime(next);
        } else if (job.calendarHours) {
          // Multiple times per day
          const currentHour = nowDate.getHours();
          const nextHour = job.calendarHours.find(h => h > currentHour) || job.calendarHours[0];
          const next = new Date(nowDate);
          next.setHours(nextHour, 0, 0, 0);
          if (nextHour <= currentHour) next.setDate(next.getDate() + 1);
          nextRun = formatTime(next);
        }
        
        jobs.push({
          id: job.id,
          name: job.name,
          schedule: job.schedule,
          status: isLoaded ? 'active' : 'stopped',
          lastRun,
          nextRun,
          enabled: isLoaded
        });
      }
    } catch (e) {
      console.error('Error reading launchd jobs:', e.message);
    }
    
    cachedCronJobs = jobs;
  }
  return cachedCronJobs;
}

// API Endpoints

// GET /api/status - combined dashboard data
app.get('/api/status', async (req, res) => {
  try {
    const activity = readJsonFile(ACTIVITY_FILE);
    const cronJobs = getCronJobs();
    const system = getSystemStats();
    const claudeUsage = getClaudeUsage();
    const weeklyUsage = await getWeeklyUsage();
    const subAgents = getSubAgents();
    
    const sessionPercent = claudeUsage?.primary?.usedPercent || 0;
    const weeklyPercent = claudeUsage?.secondary?.usedPercent || 0;
    
    const tokens = {
      sessionUsed: sessionPercent,
      sessionLimit: 100,
      sessionResets: claudeUsage?.primary?.resetDescription || '',
      weeklyUsed: weeklyPercent,
      weeklyLimit: 100,
      weeklyResets: claudeUsage?.secondary?.resetDescription || '',
      costUsd: weeklyUsage.totalCost,
      account: claudeUsage?.accountEmail || '',
      plan: claudeUsage?.loginMethod || 'API',
      model: 'claude-opus-4-5'
    };
    
    // Primary agent = main OpenClaw session (reads from state file)
    const agentState = readAgentState();
    const mainAgent = {
      name: "REM",
      status: agentState.status || "active",
      currentTask: agentState.currentTask || "Idle",
      lastTask: agentState.lastTask || "Starting up",
      lastTaskTime: agentState.lastTaskTime || "just now",
      uptime: formatUptime(system.uptime),
      tasksCompleted: weeklyUsage.messageCount || 0
    };
    
    const status = {
      timestamp: new Date().toISOString(),
      activity: activity.slice(0, 12),
      tokens,
      cronJobs,
      system,
      mainAgent,
      subAgents: subAgents.length > 0 ? subAgents : undefined,
      health: {
        api: 'healthy',
        memory: system.memory.usagePercent < 90 ? 'healthy' : 'warning',
        uptime: system.uptime
      }
    };
    
    res.json(status);
  } catch (error) {
    console.error('Error in /api/status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// GET /api/tokens - Claude Max rate limits + cost data
app.get('/api/tokens', async (req, res) => {
  try {
    const claudeUsage = getClaudeUsage();
    const weeklyUsage = await getWeeklyUsage();
    
    // Use real Claude Max rate limits if available
    const sessionPercent = claudeUsage?.primary?.usedPercent || 0;
    const weeklyPercent = claudeUsage?.secondary?.usedPercent || 0;
    
    const tokens = {
      // 5-hour window (primary rate limit)
      sessionUsed: sessionPercent,
      sessionLimit: 100,
      sessionResets: claudeUsage?.primary?.resetDescription || '',
      // Weekly window (secondary rate limit)
      weeklyUsed: weeklyPercent,
      weeklyLimit: 100,
      weeklyResets: claudeUsage?.secondary?.resetDescription || '',
      // Cost
      costUsd: weeklyUsage.totalCost,
      // Account info
      account: claudeUsage?.accountEmail || '',
      plan: claudeUsage?.loginMethod || 'API',
      model: 'claude-opus-4-5'
    };
    res.json(tokens);
  } catch (error) {
    console.error('Error in /api/tokens:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/cron - cron jobs
app.get('/api/cron', (req, res) => {
  try {
    const cronJobs = getCronJobs();
    res.json(cronJobs);
  } catch (error) {
    console.error('Error in /api/cron:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/cron/refresh - force cron refresh and broadcast
app.post('/api/cron/refresh', (req, res) => {
  try {
    const cronJobs = getCronJobs(true);  // Force refresh
    broadcast('cron', cronJobs);
    res.json({ ok: true, jobs: cronJobs });
  } catch (error) {
    console.error('Error in /api/cron/refresh:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/activity - activity log
app.get('/api/activity', (req, res) => {
  try {
    const activity = readJsonFile(ACTIVITY_FILE);
    res.json(activity);
  } catch (error) {
    console.error('Error in /api/activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/system - system stats
app.get('/api/system', (req, res) => {
  try {
    const system = getSystemStats();
    res.json(system);
  } catch (error) {
    console.error('Error in /api/system:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Periodic SSE broadcasts for data that changes without POST triggers
// Sub-agents change as sessions start/stop — poll and broadcast every 5s
setInterval(() => {
  if (sseClients.size === 0) return;
  const subAgents = getSubAgents();
  broadcast('subagents', subAgents);
}, 5000);

// System stats and tokens change gradually — broadcast every 30s
let sseTokenBroadcastTimer = null;
async function broadcastTokensAndSystem() {
  if (sseClients.size === 0) return;
  try {
    const system = getSystemStats();
    broadcast('system', system);

    const claudeUsage = getClaudeUsage();
    const weeklyUsage = await getWeeklyUsage();
    const sessionPercent = claudeUsage?.primary?.usedPercent || 0;
    const weeklyPercent = claudeUsage?.secondary?.usedPercent || 0;
    broadcast('tokens', {
      sessionUsed: sessionPercent,
      sessionLimit: 100,
      sessionResets: claudeUsage?.primary?.resetDescription || '',
      weeklyUsed: weeklyPercent,
      weeklyLimit: 100,
      weeklyResets: claudeUsage?.secondary?.resetDescription || '',
      costUsd: weeklyUsage.totalCost || 0,
      account: claudeUsage?.accountEmail || '',
      plan: claudeUsage?.loginMethod || 'API',
      model: 'claude-opus-4-5'
    });
  } catch (e) {
    console.error('Error broadcasting tokens/system:', e.message);
  }
}
setInterval(broadcastTokensAndSystem, 30000);

// Broadcast cron updates every 15 seconds
setInterval(() => {
  const cronJobs = getCronJobs(true);  // Force refresh
  broadcast('cron', cronJobs);
}, 15000);

// Start server
app.listen(PORT, 'localhost', () => {
  console.log(`Rem Dashboard API server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/status   - Combined dashboard data');
  console.log('  GET /api/tokens   - Token usage data');
  console.log('  GET /api/cron     - Cron jobs');
  console.log('  GET /api/activity - Activity log');
  console.log('  GET /api/system   - System stats');
  console.log('  GET /health       - Health check');

  // Start auto-detecting Rem activity from session transcript
  startTranscriptWatcher();
});

module.exports = app;