# FitStake Backend

Express.js backend for FitStake — handles fitness API OAuth, user registry, and vote storage.

## Endpoints

### Health
- `GET /api/health` — Server status

### Fitness OAuth
- `GET /api/strava/auth-url` — Get Strava OAuth URL
- `POST /api/strava/token` — Exchange Strava auth code for token
- `POST /api/strava/refresh` — Refresh Strava access token
- `GET /api/fitbit/auth-url` — Get Fitbit OAuth URL
- `POST /api/fitbit/token` — Exchange Fitbit auth code for token
- `POST /api/fitbit/refresh` — Refresh Fitbit access token
- `GET /api/fitness/activities` — Fetch activities from connected provider

### Onramp
- `POST /api/onramp/session` — Generate Coinbase Onramp URL for USDC purchases

### Users
- `POST /api/users/register` — Register wallet address -> email mapping
- `POST /api/users/lookup` — Look up emails for wallet addresses

### Votes
- `POST /api/votes` — Save a vote with optional rejection reason
- `GET /api/votes/:challengeId/:voterAddress` — Get votes cast by a user
- `GET /api/votes/:challengeId/for/:targetAddress` — Get votes received by a participant

## Setup

```bash
npm install
cp .env.example .env
# Fill in Strava/Fitbit API credentials
npm run dev
```

## Notes

- User and vote data is stored in-memory (resets on server restart). A persistent database is planned for production.
- Deployed on Render with CORS configured for the Vercel frontend domain.

## Related Repos

- [fitstake](https://github.com/Manya1905/fitstake) — Smart contract
- [fitstake-frontend](https://github.com/Manya1905/fitstake-frontend) — Frontend
