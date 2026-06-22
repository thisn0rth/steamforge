# StreamForge

A local-first **eSports livestream production control suite**. StreamForge runs
entirely on your machine and gives you a single control surface to:

- **Listen to Counter-Strike 2** via Game State Integration (GSI) and surface
  live match state (score, round, bomb, players, economy).
- **Control OBS** over `obs-websocket` — switch scenes, toggle sources, change
  transitions.
- **Switch "rigs"** — a *rig* is a saved combination of an OBS scene + the exact
  overlays/sources that should be visible + the transition to use. Activate a
  whole production look in one click instead of toggling things one at a time.
- **Design overlays and transitions** in an After Effects-style editor (layers,
  transform, keyframe timeline, GSI data bindings). Each overlay renders as a
  browser source you drop into OBS.

The UI is themed after [Devin.ai](https://devin.ai) — a deep, near-black
palette with an indigo accent.

> Status: early foundation. The architecture, control surface, rig engine, GSI
> pipeline, overlay renderer, and editor are in place and working end-to-end.

## Architecture

```
packages/
  shared/   Domain types + the realtime WS protocol (used by server & client)
  server/   Express API + CS2 GSI listener + obs-websocket control + WS hub
  client/   React control UI, After Effects-style editor, overlay renderer
```

- The **server** owns the single OBS connection and the GSI ingest endpoint,
  persists rigs/overlays/transitions to JSON files under `data/`, and fans out
  live state to every connected client/overlay over a WebSocket (`/ws`).
- The **client** is the control surface and the editor. Overlays are also served
  by the client at `/overlay/:id` — a chrome-less page you add to OBS as a
  **Browser Source**; it live-updates from the server socket.
- OBS does the actual compositing/encoding/streaming. StreamForge is the
  control surface and graphics designer on top of it.

```
 CS2  ──HTTP POST /gsi──▶  StreamForge server  ──WS /ws──▶  Control UI
                                  │                         Overlay pages (OBS browser sources)
                                  └──obs-websocket──▶  OBS  (scenes, sources, transitions)
```

## Quick start

Requires Node.js 20+.

```bash
npm install
npm run dev        # starts server (:4500) + client (:5173) + shared type watch
```

Open <http://localhost:5173>.

For a production-style run (server serves the built client on one port):

```bash
npm run build
npm start          # http://localhost:4500
```

## Connecting Counter-Strike 2

1. Open **Settings** in the app and download
   `gamestate_integration_streamforge.cfg`.
2. Drop it in:
   `…/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/`
3. Launch CS2. Live match state appears on the **Control Surface**.

The config points CS2 at `http://127.0.0.1:4500/gsi`. Set `STREAMFORGE_GSI_TOKEN`
to require a shared token.

## Connecting OBS

1. In OBS: **Tools → WebSocket Server Settings** → enable, note the port/password.
2. In StreamForge **Settings**, enter the URL (default `ws://127.0.0.1:4455`) and
   password, then **Connect**.
3. Add overlay graphics to OBS one of two ways:
   - **Output sources (recommended):** add a single Browser Source per scene
     pointed at `http://localhost:4500/live` (program) and, for a multiview/
     preview scene, `http://localhost:4500/preview`. You then push overlays to
     Preview and **TAKE** to Live from the Overlays page — the source URL never
     changes and you don't need a source per overlay.
   - **Per-overlay source:** use each overlay's **Copy Source URL** button
     (`http://localhost:4500/overlay/<id>`) to pin one specific overlay.

## Rigs

A rig captures a complete production state:

- a target OBS **scene**,
- a set of **source/overlay** visibility states to enforce on that scene,
- a **transition** to use when switching to it.

Activating a rig applies the transition, enforces visibility, then switches the
program scene — atomically from the operator's point of view.

## Instant replays

StreamForge drives OBS's **replay buffer** so any operator (local or remote) can
clip the last few seconds of program and have it land on the server for everyone.

1. In OBS, enable the replay buffer once: **Settings → Output → Replay Buffer**
   (set a max replay length). StreamForge can start/stop it from the **Instant
   Replay** panel on the Broadcast Control page.
2. Trigger a save any of these ways — they all go through the same server flow:
   - the **Save Replay** button in the Instant Replay panel,
   - the in-app **`R`** shortcut (when the control page is focused),
   - OBS's own **Save Replay Buffer** hotkey (**Settings → Hotkeys**). This is a
     true OS-global hotkey that fires no matter what window is focused — the
     recommended way for the person at the production host.
3. Overlapping saves are rejected server-side, so two operators can't clip at the
   same instant. Each saved clip is copied into `data/replays/`, added to the
   shared replay list, and announced in the activity feed.

**Replay scenes:** pick any OBS **media source** as the *replay player* in the
Instant Replay panel. With **auto-load** on, each new clip is pushed into that
source and restarted, so a scene built around it becomes an instant-replay scene
you can TAKE to. You can also re-load any older clip into the player on demand.

## Overlay editor

- **Layers**: text, GSI-bound text, shapes, images.
- **Transform**: position/size/rotation/scale/opacity, each keyframeable.
- **Timeline**: scrub, play, and place keyframes (diamond toggle next to each
  property) for After Effects-style animation.
- **GSI bindings**: bind a text layer to a live data path such as
  `map.team_ct.score`, `player.state.health`, or `bomb.state`.

## Multi-operator / remote teams

StreamForge is built for a whole team to drive one production together. The
server is the single source of truth (it talks to OBS and CS2); everyone else
connects a browser to it and sees live updates over the WebSocket.

**Identity & presence.** Each operator sets a display name and color (Settings →
*Your identity*, or at the sign-in screen). The sidebar shows who's online, and
the Control Surface has a live **activity feed** — "Alex went live with Main
Camera", "Sam edited Scoreboard" — so the whole crew can see what's happening.

**Auth.** Set a shared team password to gate remote access:

```bash
STREAMFORGE_TEAM_PASSWORD=your-team-password
```

- The **production host** (the machine running the server, OBS, and CS2) is
  trusted automatically — loopback clients and OBS browser sources never see a
  login prompt.
- **Remote operators** hit a sign-in screen, enter the shared password plus a
  display name/color, and get a session token that authorizes the API and the
  live socket.
- Leave `STREAMFORGE_TEAM_PASSWORD` empty for purely local use (no auth).

**One command (recommended): `npm run share`.** On the production host, run:

```bash
STREAMFORGE_TEAM_PASSWORD=your-team-password npm run share
```

This builds the app, starts the server bound to all interfaces, opens a
Cloudflare quick tunnel, and prints a public `https://<random>.trycloudflare.com`
URL to share with the team — they open it from any network, enter the team
password + a display name, and they're in. Press Ctrl+C to tear it all down.

Requirements: [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
must be installed (`brew install cloudflared` / `winget install --id Cloudflare.cloudflared`).
The command refuses to start unless `STREAMFORGE_TEAM_PASSWORD` is set, so the
production is never exposed without auth.

**Manual alternatives.** Bind to the network yourself and put it behind a tunnel:

```bash
HOST=0.0.0.0 STREAMFORGE_TEAM_PASSWORD=your-team-password npm start
```

- **Cloudflare Tunnel** (public HTTPS URL, no port forwarding):

  ```bash
  cloudflared tunnel --url http://localhost:4500
  ```

  Share the generated `https://<random>.trycloudflare.com` URL with the team.
  For a stable URL + SSO in front, use a named tunnel with Cloudflare Access.

- **Tailscale** (private mesh VPN, best for a fixed crew): install Tailscale on
  the host and each operator's machine, then reach the host at
  `http://<host-tailscale-ip>:4500`.

Always keep `STREAMFORGE_TEAM_PASSWORD` set whenever the server is reachable
beyond localhost.

## Configuration

See `.env.example`. All values are optional.

## Scripts

| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Run server + client + shared watch concurrently    |
| `npm run build`    | Build all workspaces                               |
| `npm start`        | Build, then serve the built client from the server |
| `npm run share`    | Build + serve + open a Cloudflare tunnel to share  |
| `npm run typecheck`| Type-check every workspace                          |
| `npm run lint`     | Lint with ESLint                                    |

## License

MIT
