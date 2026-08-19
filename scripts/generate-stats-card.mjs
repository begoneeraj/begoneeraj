// Regenerates assets/stats-card.svg from live GitHub data.
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

// contributionsCollection caps each query at a 1-year window, so walk the
// account's lifetime a year at a time and sum the totals.
async function lifetimeContributions(createdAt) {
  const start = new Date(createdAt);
  const now = new Date();
  let commits = 0;
  let issues = 0;
  let prs = 0;
  let reviews = 0;
  let contributedRepos = 0;

  let from = start;
  while (from < now) {
    const to = new Date(Math.min(from.getTime() + 365 * 24 * 60 * 60 * 1000, now.getTime()));
    const data = await graphql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            totalCommitContributions
            totalIssueContributions
            totalPullRequestContributions
            totalPullRequestReviewContributions
            totalRepositoriesWithContributedCommits
          }
        }
      }`,
      { login: USERNAME, from: from.toISOString(), to: to.toISOString() }
    );
    const c = data.user.contributionsCollection;
    commits += c.totalCommitContributions;
    issues += c.totalIssueContributions;
    prs += c.totalPullRequestContributions;
    reviews += c.totalPullRequestReviewContributions;
    contributedRepos = Math.max(contributedRepos, c.totalRepositoriesWithContributedCommits);
    from = to;
  }
  return { commits, issues, prs, reviews, contributedRepos };
}

async function fetchStats() {
  const profile = await graphql(
    `query($login: String!) {
      user(login: $login) {
        createdAt
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          nodes { stargazerCount }
        }
      }
    }`,
    { login: USERNAME }
  );
  const stars = profile.user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
  const { commits, prs, issues, contributedRepos } = await lifetimeContributions(profile.user.createdAt);
  return { stars, commits, prs, issues, contributedRepos };
}

function tile(x, iconPath, value, label) {
  return `
    <g transform="translate(${x - 10},26)" fill="#38bdf8">
      <path fill-rule="evenodd" d="${iconPath}"/>
    </g>
    <text x="${x}" y="70" text-anchor="middle" font-size="26" font-weight="700" fill="#e2e8f0">${value}</text>
    <text x="${x}" y="92" text-anchor="middle" font-size="10.5" letter-spacing="1.2" fill="#64748b">${label}</text>`;
}

const ICONS = {
  star: "M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25zm0 2.445L6.615 5.5a.75.75 0 01-.564.41l-3.097.45 2.24 2.184a.75.75 0 01.216.664l-.528 3.084 2.769-1.456a.75.75 0 01.698 0l2.77 1.456-.53-3.084a.75.75 0 01.216-.664l2.24-2.183-3.096-.45a.75.75 0 01-.564-.41L8 2.694v.001z",
  commit: "M10.5 7.75a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm1.43.75a4.002 4.002 0 01-7.86 0H.75a.75.75 0 110-1.5h3.32a4.001 4.001 0 017.86 0h3.32a.75.75 0 110 1.5h-3.32z",
  pr: "M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z",
  issue: "M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z",
  repo: "M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z",
};

function renderSvg({ stars, commits, prs, issues, contributedRepos }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 120" width="100%" height="120" font-family="'Segoe UI', Ubuntu, Helvetica, Arial, sans-serif">
  <defs>
    <clipPath id="rounded"><rect x="0.5" y="0.5" width="799" height="119" rx="10"/></clipPath>
  </defs>
  <g clip-path="url(#rounded)">
    <rect x="0.5" y="0.5" width="799" height="119" fill="#05070d"/>
    <line x1="160" y1="16" x2="160" y2="104" stroke="#1e293b" stroke-width="1"/>
    <line x1="320" y1="16" x2="320" y2="104" stroke="#1e293b" stroke-width="1"/>
    <line x1="480" y1="16" x2="480" y2="104" stroke="#1e293b" stroke-width="1"/>
    <line x1="640" y1="16" x2="640" y2="104" stroke="#1e293b" stroke-width="1"/>
    ${tile(80, ICONS.star, stars, "STARS")}
    ${tile(240, ICONS.commit, commits, "COMMITS")}
    ${tile(400, ICONS.pr, prs, "PULL REQUESTS")}
    ${tile(560, ICONS.issue, issues, "ISSUES")}
    ${tile(720, ICONS.repo, contributedRepos, "REPOS")}
  </g>
  <rect x="0.5" y="0.5" width="799" height="119" rx="10" fill="none" stroke="#1e293b" stroke-width="1"/>
</svg>
`;
}

const stats = await fetchStats();
await writeFile(new URL("../assets/stats-card.svg", import.meta.url), renderSvg(stats));
console.log("stats-card.svg updated:", stats);
