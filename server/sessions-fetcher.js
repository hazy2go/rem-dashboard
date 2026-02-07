/**
 * Fetch real session data from OpenClaw
 */

const { execSync } = require('child_process');

function getSessionStatus() {
  try {
    // Get main session info
    const result = execSync('openclaw status --json 2>/dev/null', { 
      encoding: 'utf8',
      timeout: 5000 
    });
    return JSON.parse(result);
  } catch (e) {
    console.error('Error getting session status:', e.message);
    return null;
  }
}

function getSessionsList() {
  try {
    // This would need to be implemented via OpenClaw API
    // For now, return parsed from openclaw status
    const result = execSync('openclaw status 2>/dev/null | grep -A20 "Sessions"', { 
      encoding: 'utf8',
      timeout: 5000 
    });
    
    // Parse the sessions table
    const lines = result.split('\n');
    const sessions = [];
    
    for (const line of lines) {
      if (line.includes('agent:main:subagent')) {
        const parts = line.split('│').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 4) {
          sessions.push({
            key: parts[0],
            kind: parts[1],
            age: parts[2],
            model: parts[3],
            tokens: parts[4] || ''
          });
        }
      }
    }
    
    return sessions;
  } catch (e) {
    console.error('Error getting sessions list:', e.message);
    return [];
  }
}

function parseContextTokens(statusOutput) {
  // Parse context usage from status output like "Context: 171k/200k (86%)"
  const match = statusOutput.match(/Context:\s*(\d+)k\/(\d+)k\s*\((\d+)%\)/i);
  if (match) {
    return {
      used: parseInt(match[1]) * 1000,
      limit: parseInt(match[2]) * 1000,
      percent: parseInt(match[3])
    };
  }
  return { used: 0, limit: 200000, percent: 0 };
}

module.exports = { getSessionStatus, getSessionsList, parseContextTokens };
