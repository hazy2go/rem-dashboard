#!/bin/bash
# Log activity to Rem Dashboard
# Usage: log-activity.sh "agent" "message" [type]
# Types: info, success, warning, error

AGENT="${1:-SYSTEM}"
MESSAGE="$2"
TYPE="${3:-info}"

if [ -z "$MESSAGE" ]; then
  echo "Usage: log-activity.sh <agent> <message> [type]"
  exit 1
fi

# Escape quotes in message
MESSAGE_ESCAPED=$(echo "$MESSAGE" | sed 's/"/\\"/g')

curl -s -X POST http://localhost:3001/api/activity \
  -H "Content-Type: application/json" \
  -d "{\"agent\":\"$AGENT\",\"message\":\"$MESSAGE_ESCAPED\",\"type\":\"$TYPE\"}" \
  > /dev/null 2>&1

exit 0
