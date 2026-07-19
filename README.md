# outage-mcp

[![npm](https://img.shields.io/npm/v/outage-mcp?style=flat-square&color=111111)](https://www.npmjs.com/package/outage-mcp)
[![license](https://img.shields.io/badge/license-MIT-111111?style=flat-square)](LICENSE)
[![powered by](https://img.shields.io/badge/data-whatbroke.today-e3120b?style=flat-square)](https://whatbroke.today)

Ask your AI if Cloudflare is down.

An MCP server that gives Claude, Cursor, and any MCP client live outage data from [whatbroke.today](https://whatbroke.today), which monitors 100+ service status pages continuously. No API keys, no signup.

```
You:    Is GitHub down right now?
Claude: GitHub has 1 active incident: [MAJOR] Git operations degraded...
        first seen 14:02 UTC. Details: whatbroke.today/incident/...
```

## Install

**Claude Desktop / Claude Code** — add to your MCP config:

```json
{
  "mcpServers": {
    "outage": {
      "command": "npx",
      "args": ["-y", "outage-mcp"]
    }
  }
}
```

**Claude Code one-liner:**

```bash
claude mcp add outage -- npx -y outage-mcp
```

Works the same in Cursor, Windsurf, and any MCP-capable client.

## Tools

| Tool | What it answers |
|------|-----------------|
| `whats_down` | "What's broken right now?" Active incidents first, then recently resolved. |
| `check_service` | "Is Stripe down?" Status and recent history for one service. |
| `get_incident` | Full detail for one incident, including AI root-cause analysis when available. |
| `outage_stats` | "What broke most this week?" Leaderboard and totals. |
| `list_services` | The 100+ services being monitored. |

## Notes

- Data comes from [whatbroke.today](https://whatbroke.today), which aggregates official status pages and adds AI summaries and RCAs.
- The upstream API is rate-limited to 5 requests/min per IP; this server caches responses for 60 seconds, which in practice keeps you under it.
- Severity `resolved` means the provider closed the incident. Everything else is treated as active.

## Development

```bash
git clone https://github.com/reshadat/outage-mcp
cd outage-mcp
npm install
npm run build
node dist/index.js   # speaks MCP over stdio
```

MIT. Built by [Reshadat Ali](https://reshadat.com) between 10pm and 1am.
