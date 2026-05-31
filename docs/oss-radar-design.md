# OSS Radar Design v1.0

## Overview

/开源雷达 (OSS Radar) is a WeChat adapter skill for scoring, comparing,
and searching GitHub open-source projects via the GitHub API.

## Architecture

```
WeChat Adapter
  └─ commands/oss-radar.js (command router)
       └─ skills/oss-radar/ (skill modules)
            ├─ github-client.js   — GitHub API via Node https (zero deps)
            ├─ score.js           — scoring engine
            ├─ compare.js         — multi-project comparison
            ├─ search.js          — keyword search
            └─ report.js          — markdown report generator
```

## Scoring Formula

```
score = starW * log2(stars+1) + forkW * log2(forks+1)
      + issueW * (1 / (openRatio + 1))
      + updateW * (1 / (daysSinceUpdate/30 + 1))

Weights: star=40, fork=20, issue=20, update=20 (max=100)
```

## API Endpoints

| Endpoint | Used By |
|----------|---------|
| GET /search/repositories?q= | search, auto-score |
| GET /repos/{owner}/{repo} | direct score, compare |

## Artifact Output

- Path: storage/artifacts/<taskId>/oss-radar-report.md
- Fields: project name, stars, forks, score, rank, analysis

## Safety Constraints

- Zero npm deps (https built-in)
- No git clone (API-only)
- No third-party code execution
- No .env/nginx/deploy changes
