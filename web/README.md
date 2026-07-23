# OnlySpeak web

Next.js 16 client for OnlySpeak.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Required public configuration:

- `NEXT_PUBLIC_API_URL`: browser-visible backend origin, normally
  `http://localhost:5000` in development.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: Google Identity Services web client ID.

Quality checks:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Authentication uses backend-issued `HttpOnly` cookies. Do not add access or
refresh tokens to browser storage or expose server secrets through a
`NEXT_PUBLIC_` variable.
