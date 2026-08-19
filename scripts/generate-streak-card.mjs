// Regenerates assets/streak-card.svg from live GitHub data.
// Run by .github/workflows/stats-card.yml (needs a token with public read access in GITHUB_TOKEN).
import { writeFile } from "node:fs/promises";

const USERNAME = "begoneeraj";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN env var is required");

async function graphql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// contributionCalendar caps each query at a 1-year window, so walk the
// account's lifetime a year at a time and concatenate the daily counts.
async function lifetimeCalendar(createdAt) {
  const start = new Date(createdAt);
  const now = new Date();
  let days = [];
  let total = 0;

  let from = start;
  while (from < now) {
    const to = new Date(Math.min(from.getTime() + 365 * 24 * 60 * 60 * 1000, now.getTime()));
    const data = await graphql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              totalContributions
              weeks { contributionDays { date contributionCount } }
            }
          }
        }
      }`,
      { login: USERNAME, from: from.toISOString(), to: to.toISOString() }
    );
    const cal = data.user.contributionsCollection.contributionCalendar;
    total += cal.totalContributions;
    for (const week of cal.weeks) {
      for (const day of week.contributionDays) {
        days.push(day);
      }
    }
    from = to;
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { days, total };
}

function computeStreaks(days) {
  let longest = { length: 0, start: null, end: null };
  let run = { length: 0, start: null };

  for (const day of days) {
    if (day.contributionCount > 0) {
      if (run.length === 0) run.start = day.date;
      run.length += 1;
      if (run.length > longest.length) {
        longest = { length: run.length, start: run.start, end: day.date };
      }
    } else {
      run = { length: 0, start: null };
    }
  }

  // Current streak: walk back from the most recent day. Today counts as
  // "still active" even with 0 contributions so far, so only break the
  // streak once a *past* day (not today) has zero contributions.
  const todayStr = new Date().toISOString().slice(0, 10);
  let current = { length: 0, start: null, end: null };
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    if (day.contributionCount > 0) {
      current.length += 1;
      current.start = day.date;
      if (!current.end) current.end = day.date;
    } else if (day.date === todayStr) {
      continue;
    } else {
      break;
    }
  }

  return { longest, current };
}

function fmt(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function tile(x, value, label, sub) {
  return `
    <text x="${x}" y="56" text-anchor="middle" font-size="28" font-weight="700" fill="#e2e8f0">${value}</text>
    <text x="${x}" y="78" text-anchor="middle" font-size="10.5" letter-spacing="1.2" fill="#64748b">${label}</text>
    ${sub ? `<text x="${x}" y="96" text-anchor="middle" font-size="10" fill="#475569">${sub}</text>` : ""}`;
}

function renderSvg({ total, current, longest }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 120" width="100%" height="120" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif">
  <defs>
    <clipPath id="rounded2"><rect x="0.5" y="0.5" width="799" height="119" rx="10"/></clipPath>
  </defs>
  <g clip-path="url(#rounded2)">
    <rect x="0.5" y="0.5" width="799" height="119" fill="#05070d"/>
    <line x1="267" y1="16" x2="267" y2="104" stroke="#1e293b" stroke-width="1"/>
    <line x1="533" y1="16" x2="533" y2="104" stroke="#1e293b" stroke-width="1"/>
    ${tile(133, total, "TOTAL CONTRIBUTIONS", "")}
    ${tile(400, current.length, "CURRENT STREAK", current.length ? `${fmt(current.start)} – ${fmt(current.end)}` : "")}
    ${tile(667, longest.length, "LONGEST STREAK", longest.length ? `${fmt(longest.start)} – ${fmt(longest.end)}` : "")}
  </g>
  <rect x="0.5" y="0.5" width="799" height="119" rx="10" fill="none" stroke="#1e293b" stroke-width="1"/>
</svg>
`;
}

const profile = await graphql(
  `query($login: String!) { user(login: $login) { createdAt } }`,
  { login: USERNAME }
);
const { days, total } = await lifetimeCalendar(profile.user.createdAt);
const { current, longest } = computeStreaks(days);
await writeFile(new URL("../assets/streak-card.svg", import.meta.url), renderSvg({ total, current, longest }));
console.log("streak-card.svg updated:", { total, current, longest });
