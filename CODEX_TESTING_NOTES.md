# Codex Testing Notes

Short notes for future Codex sessions on this Windows workspace.

## What Works

- Use `npm.cmd`, not `npm`, when running commands from PowerShell. The `npm.ps1` wrapper is blocked by the local execution policy.
- A full verification build works from the repo root with:

  ```powershell
  npm.cmd run build
  ```

- If Vite/esbuild reports it cannot read `client/vite.config.ts` because access is denied, rerun the same build with escalated permissions. In this environment, the escalated build completed successfully for shared, server, and client.
- For user testing, the simplest path is for the user to start the client dev server locally:

  ```powershell
  npm.cmd run dev --workspace=client -- --host 127.0.0.1
  ```

  Then open `http://127.0.0.1:5173`.

## What Has Not Worked

- Running plain `npm run ...` in PowerShell fails because `npm.ps1` cannot be loaded.
- Starting Vite inside the normal sandbox has failed with an access denied error while loading `client/vite.config.ts`.
- Background-launch attempts from Codex have been unreliable in this workspace:
  - PowerShell `Start-Process` failed with a duplicate `Path`/`PATH` environment error.
  - Detached Node/cmd launch attempts exited without producing useful logs.

## Recommended Pattern

1. Use `npm.cmd run build` for automated verification.
2. If the sandbox blocks Vite/esbuild, request escalation and rerun the same build.
3. Do not spend time trying multiple background dev-server launch methods from Codex.
4. Tell the user to run the client dev server locally when they want to click through the UI.
