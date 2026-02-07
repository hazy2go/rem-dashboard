#!/bin/bash
# Set current task on Rem Dashboard
# Usage: set-task.sh "Task description"

TASK="${1:-Idle}"

curl -s -X POST http://localhost:3001/api/agent \
  -H "Content-Type: application/json" \
  -d "{\"currentTask\":\"$TASK\"}" \
  > /dev/null 2>&1
