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
npm run inspect:startup
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

Relative path overrides are resolved from the repo root, not the shell's current working directory. Invalid explicit values such as a non-numeric `PORT` now fail startup instead of silently falling back.

## Deployment wiring

This repo intentionally does not include a full cloud stack yet. The current deployment layer is limited to:

- centralized runtime/env configuration
- explicit server boot entrypoint at `app/start.ts`
- health endpoint at `/api/health`
- runtime inspection endpoint at `/api/runtime/stack`
- container baseline via `Dockerfile`

That is enough to run the app in a container or basic Node host without locking the project into premature infrastructure choices.

## Deployment-like validation path

Use this sequence when you want to validate the packaged runtime before real hosting:

```bash
npm run inspect:config
npm run inspect:startup
npm run inspect:runtime
HOST=0.0.0.0 PORT=3000 npm run start
```

`inspect:startup` performs the same preflight checks the server uses at boot:

- static public directory exists
- docs repo path is readable
- manifest file is readable
- all agent prompt files referenced by the manifest exist
- session storage can be created and written

If any of those checks fail, startup exits with a clear error instead of serving a partially broken runtime.

## Container baseline

The Docker image is intentionally minimal and expects the companion docs repo to be mounted into `/opt/exidus-docs`.

Build:

```bash
docker build -t exidus-app .
```

Run:

```bash
docker run --rm -p 3000:3000 \
  -e EXIDUS_RUNTIME_ENV=container \
  -v /absolute/path/to/obsidian-exidus:/opt/exidus-docs:ro \
  exidus-app
```

Inspect:

```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/runtime/stack
```

Without the docs mount, the container now fails fast during startup because the manifest and prompts are required runtime assets.

## Deferred on purpose

- managed database or object storage
- auth and secret management systems
- background jobs and queues
- platform-specific IaC
- Next.js/Vercel migration

Those should be added after the runtime contract and app shape stabilize further.
