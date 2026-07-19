#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = "https://whatbroke.today";
const CACHE_TTL_MS = 60_000; // upstream API is rate-limited to 5 req/min per IP

interface Incident {
  id: number;
  slug: string | null;
  service: string;
  title: string;
  severity: string;
  summary: string | null;
  description: string;
  url: string;
  source_url: string | null;
  first_seen: string;
  rca?: string | null;
  updated_at?: string | null;
}

const cache = new Map<string, { at: number; data: unknown }>();

async function apiGet<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data as T;

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "User-Agent": "outage-mcp (+https://github.com/reshadat/outage-mcp)" },
  });
  if (res.status === 429) {
    throw new Error(
      "Rate limited by whatbroke.today (5 requests/min). Results are cached for 60s; try again shortly."
    );
  }
  if (!res.ok) throw new Error(`whatbroke.today returned HTTP ${res.status} for ${path}`);
  const data = (await res.json()) as T;
  cache.set(path, { at: Date.now(), data });
  return data;
}

function isActive(incident: Incident): boolean {
  return incident.severity.toLowerCase() !== "resolved";
}

function fmtIncident(incident: Incident, withDescription = false): string {
  const lines = [
    `${isActive(incident) ? "🔴" : "⚪"} [${incident.severity.toUpperCase()}] ${incident.service}: ${incident.title}`,
    `   first seen: ${incident.first_seen}`,
    `   details: ${incident.url}`,
  ];
  if (incident.summary) lines.splice(1, 0, `   ${incident.summary}`);
  if (withDescription && incident.description)
    lines.push(`   ${incident.description.slice(0, 500)}`);
  return lines.join("\n");
}

const ATTRIBUTION = "\n\nSource: https://whatbroke.today (100+ status pages, updated continuously)";

const server = new McpServer({ name: "outage-mcp", version: "0.1.0" });

server.tool(
  "whats_down",
  "Check what services are having outages or incidents right now. Returns active incidents first, then recently resolved ones.",
  { limit: z.number().min(1).max(50).default(20).describe("Max incidents to return") },
  async ({ limit }) => {
    const data = await apiGet<{ incidents: Incident[] }>(`/api/incidents?limit=${limit}`);
    const active = data.incidents.filter(isActive);
    const resolved = data.incidents.filter((i) => !isActive(i));

    const parts: string[] = [];
    parts.push(
      active.length === 0
        ? "No active incidents right now across monitored services."
        : `${active.length} ACTIVE incident(s):\n\n${active.map((i) => fmtIncident(i)).join("\n\n")}`
    );
    if (resolved.length > 0)
      parts.push(`Recently resolved:\n\n${resolved.map((i) => fmtIncident(i)).join("\n\n")}`);

    return { content: [{ type: "text", text: parts.join("\n\n---\n\n") + ATTRIBUTION }] };
  }
);

server.tool(
  "check_service",
  "Check the outage status and recent incident history of a specific service (e.g. cloudflare, github, aws, openai, stripe).",
  { service: z.string().describe("Service name, e.g. 'cloudflare' or 'github'") },
  async ({ service }) => {
    const data = await apiGet<{ incidents: Incident[] }>(`/api/incidents?limit=50`);
    const needle = service.toLowerCase().trim();
    const matches = data.incidents.filter((i) => i.service.toLowerCase().includes(needle));

    if (matches.length === 0) {
      return {
        content: [
          {
            type: "text",
            text:
              `No recent incidents found for "${service}". Either it is healthy or not monitored. ` +
              `Check https://whatbroke.today/status/${needle} or use list_services to see monitored services.` +
              ATTRIBUTION,
          },
        ],
      };
    }

    const active = matches.filter(isActive);
    const header =
      active.length > 0
        ? `${service} has ${active.length} ACTIVE incident(s):`
        : `${service}: no active incidents. Recent history:`;

    return {
      content: [
        {
          type: "text",
          text:
            `${header}\n\n${matches.map((i) => fmtIncident(i, true)).join("\n\n")}` +
            `\n\nLive status page: https://whatbroke.today/status/${needle}` +
            ATTRIBUTION,
        },
      ],
    };
  }
);

server.tool(
  "get_incident",
  "Get full detail for one incident by its slug or numeric id, including the AI root-cause analysis when available.",
  { slug: z.string().describe("Incident slug or id, as returned by whats_down / check_service") },
  async ({ slug }) => {
    const inc = await apiGet<Incident>(`/api/incident/${encodeURIComponent(slug)}`);
    const rca = inc.rca ? `\n\nRoot cause analysis:\n${inc.rca}` : "";
    return {
      content: [{ type: "text", text: fmtIncident(inc, true) + rca + ATTRIBUTION }],
    };
  }
);

server.tool(
  "outage_stats",
  "Outage leaderboard and statistics: which services broke most this week, total incidents tracked, busiest day.",
  {},
  async () => {
    const data = await apiGet<{
      overall: Record<string, unknown>;
      leaderboard: { rank: number; service: string; incident_count: number; major_count: number }[];
    }>(`/api/stats`);

    const overall = Object.entries(data.overall)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .join("\n");
    const board = data.leaderboard
      .map((r) => `${r.rank}. ${r.service} — ${r.incident_count} incidents (${r.major_count} major)`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Overall:\n${overall}\n\nThis week's leaderboard:\n${board}` + ATTRIBUTION,
        },
      ],
    };
  }
);

server.tool(
  "list_services",
  "List all services monitored for outages, with lifetime incident counts.",
  {},
  async () => {
    const data = await apiGet<{ total_services: number; services: { name: string; incident_count: number }[] }>(
      `/api/services`
    );
    const list = data.services
      .map((s) => `${s.name} (${s.incident_count})`)
      .join(", ");
    return {
      content: [
        {
          type: "text",
          text: `${data.total_services} monitored services:\n${list}` + ATTRIBUTION,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
