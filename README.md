# Vancrypto

Vancrypto is a static crypto brokerage prototype with a Node.js API backed by PostgreSQL. Render can provision the web service and database together from [render.yaml](render.yaml).

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer for local development, or a Render PostgreSQL database

## Run locally

```powershell
npm start
```

The server requires `DATABASE_URL`. Copy `.env.example` to `.env` and set it to your PostgreSQL connection string before starting. The app creates its `users` and `sessions` tables automatically on startup.

Open <http://localhost:3000> to view the app. During development, use `npm run dev` to restart the server when files change.

## Deploy to Render

1. Push this repository to GitHub or another Git provider supported by Render.
2. In Render, choose **New > Blueprint** and select the repository.
3. Confirm the services in `render.yaml`. Render will create `vancrypto-api` and `vancrypto-db`, then connect them with `DATABASE_URL`.
4. Open the generated service URL and check `/api/health`.

The Blueprint uses Render's free plans for development. Free database instances are not suitable for production funds or financial data.

## API starter routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Verify that the API is running |
| `GET` | `/api/markets` | Return the prototype market ticker |
| `GET` | `/api/me` | Return the authenticated user for a bearer token |
| `GET` | `/api/dashboard` | Return authenticated account balances and holdings |
| `POST` | `/api/auth/register` | Create a PostgreSQL-backed account |
| `POST` | `/api/auth/login` | Authenticate an account and create a persisted session |

Example registration request:

```json
{
  "email": "you@example.com",
  "password": "at-least-8-characters"
}
```

To remove temporary smoke-test accounts from the hosted database, open the Render web service shell and run:

```sh
npm run db:clear-test
```

This only removes accounts matching `copilot-*@example.com`.

If the service plan does not provide a shell, temporarily add a Render environment variable named `CLEANUP_TOKEN`, redeploy, then call:

```powershell
$headers = @{ Authorization = "Bearer YOUR_CLEANUP_TOKEN" }
Invoke-RestMethod https://your-service.onrender.com/api/admin/clear-test-data -Method Post -Headers $headers
```

Remove `CLEANUP_TOKEN` from Render after the request succeeds and redeploy again. Without that variable, the cleanup route is disabled.

## Backend roadmap

1. Connect the login, registration, and dashboard forms to the API.
2. Add request validation, rate limiting, structured logging, and automated tests.
3. Add market-data and portfolio services behind explicit provider interfaces.
4. Replace the development token flow with secure, expiring, revocable session cookies.

The API is not ready for real funds, production authentication, or financial activity.
