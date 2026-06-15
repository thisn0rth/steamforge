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
3. Add overlays to scenes as **Browser Sources** using the URL from each
   overlay's **Copy Source URL** button (`http://localhost:4500/overlay/<id>`).

## Rigs

A rig captures a complete production state:

- a target OBS **scene**,
- a set of **source/overlay** visibility states to enforce on that scene,
- a **transition** to use when switching to it.

Activating a rig applies the transition, enforces visibility, then switches the
program scene — atomically from the operator's point of view.

## Overlay editor

- **Layers**: text, GSI-bound text, shapes, images.
- **Transform**: position/size/rotation/scale/opacity, each keyframeable.
- **Timeline**: scrub, play, and place keyframes (diamond toggle next to each
  property) for After Effects-style animation.
- **GSI bindings**: bind a text layer to a live data path such as
  `map.team_ct.score`, `player.state.health`, or `bomb.state`.

## Configuration

See `.env.example`. All values are optional.

## Scripts

| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Run server + client + shared watch concurrently    |
| `npm run build`    | Build all workspaces                               |
| `npm start`        | Build, then serve the built client from the server |
| `npm run typecheck`| Type-check every workspace                          |
| `npm run lint`     | Lint with ESLint                                    |

## License

MIT
