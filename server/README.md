# Rem Dashboard API Server

Backend API server for the Rem Dashboard providing live data endpoints.

## Setup

1. Install dependencies:
```bash
cd ~/.openclaw/workspace/rem-dashboard/server
npm install
```

2. Start the server:
```bash
npm start
# or for development with auto-reload:
npm run dev
```

The server will run on `http://localhost:3001`

## API Endpoints

- **GET /api/status** - Combined dashboard data including recent activity, tokens, cron jobs, and system stats
- **GET /api/tokens** - Token usage data (reads from `~/.openclaw/workspace/rem-tokens.json`)
- **GET /api/cron** - Cron jobs list (executes `openclaw cron list`)
- **GET /api/activity** - Activity log (reads from `~/.openclaw/workspace/rem-activity.json`)
- **GET /api/system** - System stats (memory, CPU, uptime)
- **GET /health** - Health check endpoint

## Data Files

- `~/.openclaw/workspace/rem-activity.json` - Activity log entries
- `~/.openclaw/workspace/rem-tokens.json` - Token usage tracking

## Activity Logging

Use the helper script to log activities:

```bash
# Basic usage
./update-activity.sh "Dashboard updated"

# With custom type and level
./update-activity.sh "Error occurred" "error" "error" "dashboard"

# Examples
./update-activity.sh "Task completed" "task" "info" "automation"
./update-activity.sh "Memory usage high" "system" "warning" "monitor"
```

## CORS

The API is configured to accept requests from `localhost:3000` for the frontend dashboard.

## Polling

The frontend polls these endpoints every 3-5 seconds for real-time updates.

## Activity Log Format

Each activity entry includes:
- `timestamp`: ISO timestamp
- `type`: Activity type (activity, error, task, system, etc.)
- `message`: Human-readable message
- `source`: Source of the activity (rem, dashboard, automation, etc.)
- `level`: Log level (info, warning, error)

## Token Tracking Format

Token data includes:
- `total`: Total token allocation
- `used`: Tokens consumed
- `remaining`: Tokens remaining
- `lastReset`: Last reset timestamp
- `resetPeriod`: Reset frequency
- `history`: Array of token usage history