# Hosting the MultiVRZ Cable Schedule on Railway

The portal runs two ways from this one codebase:

- **claude.ai artifact.** Shared data is kept in the artifact's database.
- **Standalone server (Railway).** `deploy/server.mjs` serves the built portal and keeps shared data in `DATA_DIR/store.json`.

The browser code detects which one it is running on, so live sharing, progress tracking and sign-off work the same on both.

## Railway setup (one-off)

1. In Railway: **New Project → Deploy from GitHub repo** and pick this repository. Railway builds it from the `Dockerfile`.
2. **Add a volume** to the service (right-click the service → Attach volume) and mount it at `/data`. Without a volume, changes are lost on every redeploy.
3. **Variables** (service → Variables):
   - `APP_USERS` = `dave:choose-a-password,billy:another-password`. These people can edit, and sign in with their name and password.
   - `APP_VIEWERS` = `client:view-password` (optional). These people can view but not change anything.
4. **Settings → Networking → Generate Domain** to get the public `https://….up.railway.app` link.

On first start the store is seeded from `deploy/seed.json`, a copy of the Karrinyup data from the claude.ai portal. After that, the Railway copy and the claude.ai copy are separate. Use one as the master, and move data between them with **Sites → Download backup / Restore backup**.

## Updating the site

Edit the code in `client/src`, then:

```
node scripts/build-artifact.mjs   # builds dist-artifact/ (LOCAL_PACKAGES=1 VENDOR_DIR=node_modules bundles from pnpm install instead of jsDelivr)
./scripts/make-deploy.sh          # copies it into deploy/public
git commit -am "…" && git push    # Railway redeploys automatically
```

`deploy/public` is committed on purpose, so Railway needs no npm install or build step.
