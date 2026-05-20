# DockerAgent Project Constraints

## 1. Product Boundary

DockerAgent is a Chinese-first local tool for self-hosted Docker/Compose application installation and management.

It should not become a generic DevOps, SSH, Linux operations, or server-control workbench.

The core product loop is:

1. User provides a GitHub repo, Compose project, app name, or plain-language need.
2. DockerAgent reads README, docker-compose.yml, .env.example, and related deployment docs.
3. DockerAgent asks for required configuration in Chinese.
4. DockerAgent performs Compose preflight checks.
5. DockerAgent requests explicit confirmation before writing files or changing Docker state.
6. DockerAgent creates a deployment snapshot.
7. DockerAgent deploys, checks containers/logs, shows access URLs, and registers the app.
8. User can inspect the app, logs, compose/env files, snapshots, and rollback entry points.

Optimize for this loop before adding adjacent features.

## 2. Non-Goals

Do not broaden DockerAgent into:

- A full Linux server management panel.
- A generic SSH command center.
- A Kubernetes platform.
- A CI/CD platform.
- A cloud-hosted multi-tenant control plane.
- A replacement for Portainer across every Docker feature.

Server-level operations are allowed only when they directly support Docker/Compose application deployment, inspection, or rollback.

## 3. Security Baseline

DockerAgent mounts `/var/run/docker.sock`, which is effectively high-privilege control of the host Docker daemon.

Security-sensitive defaults are mandatory:

- Default exposure must be localhost-only.
- Never encourage direct public internet exposure.
- If `ACCESS_TOKEN` is not set, backend access must remain local-only.
- WebSocket access must follow the same access boundary as HTTP.
- CORS, Host checks, and bind addresses are product safety features, not optional polish.
- `.env` display must be masked by default. Do not add plaintext secret viewing without a separate explicit design decision.
- App file reads must be constrained to the app work directory.

Dangerous Docker/Compose operations must require backend-enforced confirmation, not only prompt text.

Dangerous operations include at least:

- Starting, stopping, restarting, or removing containers.
- Removing images, networks, or volumes.
- Running new containers.
- Writing or overwriting compose/env files.
- `docker compose up`, `down`, or equivalent deployment mutations.
- Rollback operations.

## 4. Deployment Behavior

Before deployment:

- Analyze Compose and env requirements.
- Warn about public port bindings.
- Warn about Docker socket mounts.
- Warn about host root mounts.
- Warn about missing env values.
- Block obvious host port conflicts before writing files.
- Show the files that will be written.
- Show expected local access URLs when inferable.
- Create a snapshot before writing compose/env or running Compose.

After deployment:

- Register the app with name, compose project, work directory, compose path, env path, source URL, access URLs, and status.
- Link deployment results to the app detail page.
- Provide logs, access URLs, compose/env inspection, related containers, and related snapshots from the app detail page.

## 5. Rollback Boundary

Rollback is part of the application-management loop, not a broad server restore system.

Snapshots should be associated with Compose projects when created as part of deployment.

Rollback UI should make it clear:

- Which snapshot is being used.
- Whether volumes are preserved.
- Which application or Compose project the snapshot belongs to, when known.

Never delete volumes by default.

## 6. Frontend Constraints

The UI should feel like a practical local operations tool, not a marketing site.

Prefer:

- Dense but readable application management cards.
- Clear status, logs, paths, access URLs, snapshots, and rollback entry points.
- Chinese copy for user-facing deployment guidance.
- Explicit warning states for risky actions.
- Familiar icons for actions.

Avoid:

- Landing-page-first product flow.
- Decorative redesigns unrelated to deployment management.
- Hiding dangerous behavior behind vague button text.
- Showing secrets in plaintext.

## 7. Engineering Constraints

Keep changes surgical.

- Do not do broad refactors unless required by the task.
- Prefer existing patterns and local helpers.
- Add focused tests for behavior changes.
- Use UTF-8 for file reads/writes in code.
- Keep Windows/PowerShell compatibility in mind.
- Do not add new dependencies without a clear reason.
- Do not delete user data, containers, images, networks, volumes, or files without explicit confirmation.

For database changes:

- Prefer small additive columns over schema rewrites.
- Include compatibility handling for existing SQLite databases.
- Avoid introducing a migration framework unless the project has clearly outgrown `create_all` plus small compatibility steps.

## 8. Verification Expectations

For backend changes, run the relevant unit tests and `py_compile` where practical.

For frontend changes, run:

```bash
npm run build
```

The current frontend may warn about large chunks; treat that as a known warning unless the change made it materially worse.

For Docker/deployment changes, prefer a real smoke test with `examples/nginx-demo` when the user explicitly approves creating containers.

## 9. Collaboration Rules

Default language is Chinese.

Before changing product direction, data structures, destructive behavior, or security posture, explain the reason and impact.

If a simpler approach preserves the Docker/Compose app-management focus, choose it.

If a requested feature pushes DockerAgent toward generic server management, call that out and propose a narrower app-layer version.
