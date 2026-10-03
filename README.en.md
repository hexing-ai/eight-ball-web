# Eight Ball · 好友八球

**See where the object ball goes—and where the cue ball goes next.**

A landscape pool game for desktop and mobile browsers, with two aim guides, follow/draw spin, solo practice, and self-hosted friend multiplayer.

[**Play the demo**](https://hexing-ai.github.io/eight-ball-web/) · [中文](README.md) · [Architecture](docs/ARCHITECTURE.md)

[![Actual multiplayer gameplay](docs/screenshots/desktop-game.png)](https://hexing-ai.github.io/eight-ball-web/)

**Play solo immediately, or choose two-player hotseat.** Practice has no timer or fouls: pot all 15 object balls in any order, reposition the cue ball freely, or reset the rack. Potting the black early does not end practice. Progress resets when you leave or reload. It runs entirely in the browser and does not offer remote matchmaking. GitHub Pages cannot host the WebSocket server; the full multiplayer backend is included for self-hosting. The current game UI and detailed documentation are in Chinese.

## Try it in a minute

Open the [demo](https://hexing-ai.github.io/eight-ball-web/), click the gold solo-practice button, aim with your mouse, hold **W**, then release to shoot. On mobile, rotate to landscape, drag to aim and pull down the right power bar to shoot. The left rail fine-tunes the angle; the cue-ball widget sets top/back spin.

Gold predicts the object-ball direction. Dashed blue predicts the cue-ball direction after contact. Both respond to shot power and strike position.

## Run locally

Requires **Node.js 22+** and npm.

```bash
git clone https://github.com/hexing-ai/eight-ball-web.git
cd eight-ball-web
npm ci
npm run dev
```

Visit **http://127.0.0.1:5188/** and choose solo practice without a nickname. For multiplayer, create a room in one tab, join with its eight-character invite code in a second tab, and ready both players. The backend listens on port 2567.

For the browser-only solo / hotseat demo, run `npm run demo` instead of `npm run dev`.

## Built for actual play

- Canvas-rendered green cloth, wood rails, numbered solids/stripes, six pockets and synthesized audio.
- Desktop mouse + W and mobile landscape controls, with fine adjustment and top/back spin.
- Shared physics and rules for previews, animation, hotseat and multiplayer.
- Server-authoritative shots, turn/version checks, idempotency, input validation and 60-second reconnection.
- Invite rooms, ball-in-hand, fouls, black-eight win/loss and rematches.

![Mobile landscape gameplay, captured using touch emulation](docs/screenshots/mobile-landscape.png)

## Commands

| Command | Purpose |
| --- | --- |
| `npm run demo` | Local browser-only solo / hotseat demo |
| `npm run dev` | Full frontend + multiplayer backend |
| `npm run typecheck` | Type-check frontend and backend |
| `npm test` | Physics, rules, inputs, demo and real HTTP/WebSocket integration |
| `npm run build` | Build server and full frontend |
| `npm run build:demo` | Build the static demo for Pages |

For production, serve the built `web-dist/` through the backend with `STATIC_DIR=./web-dist`, set an exact `ALLOWED_ORIGINS`, and terminate HTTPS with WebSocket forwarding. See [deployment](docs/DEPLOYMENT.md).

## Scope and limitations

This is a casual planar model, not a calibrated billiards simulator. It implements follow/draw but not side spin or jump shots. Aim guides show short paths after the first collision, not guaranteed pots.

Multiplayer uses one Node.js process and in-memory rooms. Restarting the server interrupts matches. Physical mobile devices, Safari and public-network capacity require further validation. There is no AI opponent, account system or ranking service.

## Rights and feedback

**Source available; all rights reserved. This is not an MIT-licensed or otherwise open-source project.** No modification, redistribution or commercial-use license is granted beyond rights provided by applicable law or GitHub's terms. See [LICENSE](LICENSE). Third-party components retain their own licenses; the adapted pooltool strike equation is Apache-2.0. See [notices](THIRD_PARTY_NOTICES.md).

Bug reports and usability feedback are welcome through [Issues](https://github.com/hexing-ai/eight-ball-web/issues). If you enjoy the table or want to follow development, leave a **Star**.
