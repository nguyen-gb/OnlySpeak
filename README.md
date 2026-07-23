# OnlySpeak

OnlySpeak is an English conversation-practice app with a FastAPI/PostgreSQL
backend and a Next.js web client. The mobile client remains in the repository,
but the current hardening work targets only `backend/` and `web/`.

## Run with Docker Compose

Requirements: Docker Engine with Compose v2.

1. Copy `.env.example` to `.env`.
2. Set `POSTGRES_PASSWORD`, update the password inside `DATABASE_URL`, and
   generate `SECRET_KEY` with `openssl rand -hex 32`.
3. Set the Google client IDs used by the API and web client. Set
   `GEMINI_API_KEY` only if AI free-talk is enabled.
4. Start the stack:

   ```bash
   docker compose up --build
   ```

The web app is served at `http://localhost:3000`, the API at
  `http://localhost:5000`, and development API docs at
  `http://localhost:5000/api/docs`. A one-shot `migrate` service applies Alembic
  migrations before the API starts. PostgreSQL is bound to localhost only.

## Local development

Backend (Python 3.12 and PostgreSQL 16 recommended):

```bash
cd backend
python -m venv .venv
# Activate .venv for your shell, then:
pip install -r requirements-dev.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 5000
```

Web (Node.js 22 recommended):

```bash
cd web
npm ci
cp .env.example .env.local
npm run dev
```

Google OAuth must allow the exact web origin. For local development that is
normally `http://localhost:3000`.

## Verification

```bash
cd backend
pytest -q

cd ../web
npm run lint
npx tsc --noEmit
npm run build
```

## Production checklist

- Use `ENVIRONMENT=production`, `DEBUG=false`, HTTPS origins in
  `CORS_ORIGINS`, and `COOKIE_SECURE=true`.
- Use a unique random `SECRET_KEY`; changing it signs every user out.
- The revocable-session migration intentionally invalidates JWTs issued by
  older versions once; users sign in again after that deployment.
- The auth-identity migration upgrades legacy Google-linked `LOCAL` users and
  rejects duplicate Google subjects rather than merging user data implicitly.
- Keep the API and web app on the same site when using `COOKIE_SAMESITE=lax`.
  For a genuinely cross-site deployment, use `COOKIE_SAMESITE=none` only over
  HTTPS and review CSRF controls before release.
- Store PostgreSQL, Google, and Gemini credentials in the deployment secret
  manager rather than in committed files or Docker image build arguments.
- Persist `/app/static/audio` if generated audio must survive deployments.
- Run `alembic upgrade head` as a one-shot release job before starting multiple
  API replicas. The Compose stack already follows this pattern.
