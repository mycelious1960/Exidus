# Exidus App

This repo contains the current Exidus agentic runtime and local assessment app shell.

## Runtime posture

- lean TypeScript Node runtime
- static web shell served from `app/public`
- session persistence written to `.data/sessions`
- agent manifest and prompts loaded from the companion docs repo

## Run locally

1. Copy `.env.example` values into your shell or a local env file loader of your choice.
2. Ensure `EXIDUS_DOCS_ROOT` points to the companion docs repo.
3. Start the app:

```bash
npm run dev
```

Useful inspection commands:

```bash
npm run inspect:config
npm run inspect:runtime
```

## Runtime config

The app resolves runtime settings in `runtime/config.ts`.

Supported environment variables:

- `HOST`: server bind host. Defaults to `127.0.0.1`. Set `0.0.0.0` for containers.
- `PORT`: server port. Defaults to `3000`.
- `EXIDUS_RUNTIME_ENV`: deployment label such as `development` or `staging`.
- `EXIDUS_DOCS_ROOT`: path to the `obsidian-exidus` repo.
- `EXIDUS_MANIFEST_PATH`: optional direct override for the manifest JSON path.
- `EXIDUS_DATA_ROOT`: optional override for persisted session storage.
- `EXIDUS_PUBLIC_DIR`: optional override for static assets.

## Deployment wiring

This repo intentionally does not include a full cloud stack yet. The current deployment layer is limited to:

- centralized runtime/env configuration
- explicit server boot entrypoint at `app/start.ts`
- health endpoint at `/api/health`
- runtime inspection endpoint at `/api/runtime/stack`
- container baseline via `Dockerfile`

That is enough to run the app in a container or basic Node host without locking the project into premature infrastructure choices.

## Deferred on purpose

- managed database or object storage
- auth and secret management systems
- background jobs and queues
- platform-specific IaC
- Next.js/Vercel migration

Those should be added after the runtime contract and app shape stabilize further.
