# Remote Access via Cloudflare Zero Trust

Expose T3 Code securely over the internet using Cloudflare Tunnel + Access. No ports need to be opened — `cloudflared` creates an outbound connection to Cloudflare's edge.

## Prerequisites

- A domain on Cloudflare DNS (e.g. `example.com`)
- `cloudflared` installed and a tunnel already running on the host machine
- T3 Code built (`bun run build`)
- Node 24+ (`nvm use 24`)

## Architecture

```
Browser (anywhere) → https://code.example.com
  → Cloudflare Access (email OTP gate)
  → Cloudflare Tunnel (encrypted)
  → cloudflared on your machine
  → http://<LAN_IP>:3773 (T3 Code)
```

---

## Step 1: Add a Published Application Route (Tunnel)

1. Go to **Cloudflare Dashboard → Zero Trust → Networks → Connectors**
2. Click your tunnel (e.g. `192.168.0.21 - mac`)
3. Go to the **Published application routes** tab
4. Click **"+ Add a published application route"**
5. Fill in:
   - **Subdomain**: `code`
   - **Domain**: `example.com`
   - **Path**: leave empty
   - **Service Type**: `HTTP`
   - **Service URL**: `<LAN_IP>:3773` (e.g. `192.168.0.21:3773`)
     - **Do NOT use `localhost`** — use the machine's LAN IP
6. Save

## Step 2: Create a Reusable Access Policy

1. Go to **Zero Trust → Access controls → Policies**
2. Click **"+ Add a policy"**
3. Fill in:
   - **Policy name**: `Allow Owner` (or whatever you want)
   - **Action**: `Allow`
   - **Selector**: `Emails`
   - **Value**: your email (e.g. `you@icloud.com`)
4. Save

## Step 3: Create an Access Application

1. Go to **Zero Trust → Access controls → Applications**
2. Click **"+ Add an application"**
3. Select **Self-hosted**
4. **Configure application** step:
   - **Application name**: `T3 Code`
   - **Session Duration**: `1 month` (so you don't re-auth constantly)
   - **Public hostname**:
     - **Subdomain**: `code`
     - **Domain**: `example.com`
   - Leave path empty
   - Leave everything else as defaults
   - Click **Next**
5. **Experience settings** step:
   - Leave defaults
   - Click **Next**
6. **Advanced settings** step:
   - Leave defaults
   - Click **Save**
7. After saving, click on the **T3 Code** app in the list
8. Click **Configure**
9. Go to the **Policies** tab
10. Click **"Select existing policies"**
11. Check **Allow Owner** and click **Confirm**
12. Click **Save application**

## Step 4: Start T3 Code

```bash
bun install
bun run build
bun run --cwd apps/server dev -- --host <LAN_IP> --port 3773 --no-browser
```

Replace `<LAN_IP>` with the machine's local IP (e.g. `192.168.0.21`).

**Do NOT use `--auth-token`** — the browser's WebSocket client doesn't pass the token through, and Cloudflare Access is already gating access. Using `--auth-token` will cause WebSocket connections to fail with `ERR_BLOCKED_BY_CLIENT`.

## Step 5: Access from Anywhere

Open `https://code.example.com` in any browser.

Cloudflare will prompt for your email, send a one-time PIN, and grant access for the session duration (1 month).

---

## Troubleshooting

### WebSocket fails with `ERR_BLOCKED_BY_CLIENT`

You're running with `--auth-token`. Remove it. Cloudflare Access handles authentication — the auth token is redundant and breaks WebSocket connections because the browser doesn't append `?token=` to the WebSocket URL.

### Providers stuck at "Checking provider status"

WebSocket isn't connecting. Check the browser console for errors. Usually caused by `--auth-token` being set (see above).

### Project stuck on "Adding..."

Same root cause — WebSocket commands are timing out because the connection is rejected.

### `scheduleTask is not a function` on startup

Effect dependency version mismatch. Add an override in root `package.json` to force a single version:

```json
{
  "overrides": {
    "effect": "<same version spec as the root effect dependency>"
  }
}
```

Then `bun install` again.

### `Cannot find module dist/index.mjs`

You need to build first: `bun run build`

---

## Security Notes

- Cloudflare Access is the sole authentication layer in this setup
- Only emails listed in the Access policy can reach the app
- The tunnel never exposes any ports on your machine
- Session duration of 1 month means you authenticate once per month per browser
- You can add more emails to the "Allow Owner" policy or create additional policies as needed
