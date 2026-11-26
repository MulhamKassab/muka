# Muka Phone

A read-only web app that shows your Claude sessions on your iPhone: working or idle, prompt and session cost, context use, score, plan, helpers, activity, tools, changes and alerts. The Muka mod writes one status file per session to `~/.claude/muka/live/<sessionId>.json`; this small server (Node built-ins only, no install) serves those files and the page.

The page is read-only. There are no buttons that change anything. Actions stay in the Claude app (`/muka ...`).

## Run it on the PC

```
node server.mjs
```

or run `start.ps1` in this folder. It listens on `127.0.0.1:4791` only (change with `MUKA_PHONE_PORT`). Status files are read from `~/.claude/muka/live`; override with `MUKA_LIVE_DIR`.

Try it with the sample file (no Claude session needed):

```
MUKA_LIVE_DIR=sample node server.mjs        # PowerShell: $env:MUKA_LIVE_DIR='sample'; node server.mjs
```

Open http://localhost:4791. The sample's timestamps are old, so it shows the "stale" badge: that is expected.

## Put it on your iPhone

The phone reaches the PC through Tailscale, which keeps it on your private tailnet (never the public internet).

1. Install Tailscale on the PC and on the iPhone and sign in to the same account on both.
2. In the Tailscale admin console (DNS page) make sure MagicDNS is on, and under HTTPS Certificates choose Enable HTTPS. (Tailscale docs: tailscale.com/kb/1153/enabling-https and tailscale.com/kb/1312/serve. Check them if the console wording has changed.)
3. Start the server on the PC (`node server.mjs`), then in a terminal run:
   ```
   tailscale serve --bg 4791
   ```
   `tailscale serve status` shows the URL.
4. On the iPhone open `https://<pc-name>.<tailnet>.ts.net` in Safari.
5. Tap Share, then Add to Home Screen. It opens full screen like an app.

Never use `tailscale funnel`: it publishes the page on the public internet. To stop sharing: `tailscale serve reset`.

## Behaviour

- The page polls every 3 seconds, only while it is visible.
- "stale" means the session says it is working but has not updated for 90 seconds.
- "PC not reachable (asleep or offline)" means the phone cannot reach the server; it shows the last successful update time.
- Sessions older than 48 hours are not listed.
- The server answers only GET and HEAD, only for hosts `localhost`, `127.0.0.1`, `[::1]` and `*.ts.net`, and serves only the files in `public/`.

## Test

```
node --test .
node --check public/app.js
```
