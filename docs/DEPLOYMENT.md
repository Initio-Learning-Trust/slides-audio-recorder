# Deployment runbook

Two things have to be deployed: the **recording window** (static files on an https origin you own)
and the **add-on** (an Apps Script project published through the Google Workspace Marketplace SDK).

Do them in that order — the add-on needs to know the recorder's origin.

---

## Part 1 — Publish the recording window

The recorder is plain static HTML/JS. Anywhere with https will do; the repo ships a GitHub Pages
workflow.

### Option A: GitHub Pages (fastest)

1. In the repository, go to **Settings ▸ Pages** and set **Source** to *GitHub Actions*. Do this
   by hand: the workflow passes `enablement: true`, but creating a Pages site needs repository
   **admin** rights and the Actions token only ever gets write, so it cannot bootstrap itself
   (`Create Pages site failed. Error: Resource not accessible by integration`).
   Choosing *Deploy from a branch* instead publishes the repository root through Jekyll, which
   serves the recorder but puts the privacy policy at `/site/privacy.html` and breaks the links
   that expect it at `/privacy.html`.
2. Push to `main`. `.github/workflows/pages.yml` assembles `site/` plus `recorder/` and deploys.
3. The recorder is then at
   `https://initio-learning-trust.github.io/slides-audio-recorder/recorder/`, which is the default
   in `apps-script/Config.js`.

### Option B: a domain you own (recommended for a public listing)

OAuth verification requires you to prove ownership of the domains in your listing, and a
`github.io` subdomain is awkward to verify. If you plan to publish publicly, put the recorder on
something like `https://slides-audio.initiolearning.org`:

1. Add a `CNAME` file to `site/` containing the hostname, and point a DNS `CNAME` at
   `initio-learning-trust.github.io` (or host the files anywhere else with https).
2. Verify the domain in [Google Search Console](https://search.google.com/search-console) using the
   same account that owns the Cloud project.
3. Tell the add-on where it lives — see step 4 of Part 2.

### Check it

Open the recorder URL directly. You should see *"Open this from Google Slides"* — that is the page
correctly refusing to do anything without a sidebar to talk to.

---

## Part 2 — Push the add-on

### 1. Create the Apps Script project

```bash
npm install
npm run build            # regenerates apps-script/Protocol.html
npx clasp login
npx clasp create --title "Slides Audio Recorder" --type slides --rootDir apps-script
npx clasp push
```

`clasp create --type slides` makes a container-bound script attached to a new presentation, which is
ideal for testing. For publishing you may prefer a standalone script (`--type standalone`); either
works, but keep one project per environment (test and production) rather than publishing the one you
develop in.

Copy `.clasp.json.example` to `.clasp.json` if you are joining an existing project instead, and fill
in the script id.

### 2. Enable the Drive API before the first test

Until step 5 links a standard Cloud project, the script runs under the hidden default Cloud project
that Apps Script created, and the Drive API is not enabled on it. The first save will fail with:

```
Google Drive refused the request (403). Google Drive API has not been used in
project NNNNNNNNNNNN before or it is disabled.
```

Follow the link in that message to enable the Drive API on that project and wait a minute, or skip
ahead to step 5 and link a standard project now. Either way the API has to be on before a recording
can be saved.

### 3. Test it before publishing anything

1. `npx clasp open`, then **Deploy ▸ Test deployments ▸ Install**.
2. Open a presentation and choose **Extensions ▸ Slides Audio Recorder ▸ Record audio**.
3. Work through [TESTING.md](TESTING.md).

### 4. Point the add-on at your recorder (only if you changed it)

In the Apps Script editor: **Project Settings ▸ Script Properties ▸ Add script property**.

| Property | Example |
| --- | --- |
| `RECORDER_ORIGIN` | `https://slides-audio.initiolearning.org` |
| `RECORDER_PATH` | `/recorder/` |

Script Properties override `DEFAULT_RECORDER_ORIGIN` / `DEFAULT_RECORDER_PATH` in `Config.js`, so a
deployment can be re-pointed without a code change. The origin must be https; the add-on refuses
anything else.

### 5. Link a standard Cloud project

The default Cloud project Apps Script creates cannot be used for publishing.

1. In [Google Cloud console](https://console.cloud.google.com), create a project (e.g.
   *Slides Audio Recorder*) and note its **project number**.
2. Configure **APIs & Services ▸ OAuth consent screen**:
   - User type **Internal** if only your Workspace organisation will use it (this is the fast path —
     internal apps need no verification), or **External** for a public listing.
   - App name, support email, developer contact, app logo (`assets/icon-128.png`).
   - Authorised domains: the domain hosting your privacy policy and terms.
   - Add the four scopes listed in [OAUTH_SCOPES.md](OAUTH_SCOPES.md).
3. Enable these under **APIs & Services ▸ Library**:
   - **Google Drive API** — required. The add-on calls the Drive REST API directly (rather than
     using `DriveApp`, which would drag in the restricted full `drive` scope), and a direct REST
     call fails with `403 ... has not been used in project N before or it is disabled` until the
     API is switched on for the project the script runs under. Enabling it here covers every user
     of the published add-on; they never enable anything themselves.
   - **Google Workspace Marketplace SDK** — required to publish.
4. Back in Apps Script: **Project Settings ▸ Google Cloud Platform (GCP) Project ▸ Change project**,
   and paste the project number.

### 6. Create the add-on deployment

In the Apps Script editor: **Deploy ▸ New deployment ▸ Add-on ▸ Deploy**.

Note two values — you need both in the next step:

- **Script ID** — *Project Settings ▸ IDs ▸ Script ID*
- **Version number** — *Deploy ▸ Manage deployments*

### 7. Configure the Marketplace SDK

In Cloud console: **APIs & Services ▸ Google Workspace Marketplace SDK ▸ App Configuration**.

| Field | Value |
| --- | --- |
| App visibility | **Private** (your organisation only) or **Public** |
| Installation settings | Admin-only install, or individual + admin |
| App integration | **Google Workspace Add-on** ▸ untick; **Editor Add-on** ▸ tick |
| Editor add-on ▸ Script ID | from step 6 |
| Editor add-on ▸ Version | from step 6 |
| Editor add-on ▸ Extends | **Slides** |
| OAuth scopes | the four scopes from [OAUTH_SCOPES.md](OAUTH_SCOPES.md), matching `appsscript.json` exactly |
| Developer links | website, privacy policy, terms — see below |

Then fill in **Store Listing** using [MARKETPLACE_LISTING.md](MARKETPLACE_LISTING.md), which has the
text and the required assets ready.

If you published the site with GitHub Pages as in Part 1:

| Link | URL |
| --- | --- |
| Website / support | `https://initio-learning-trust.github.io/slides-audio-recorder/` |
| Privacy policy | `https://initio-learning-trust.github.io/slides-audio-recorder/privacy.html` |
| Terms of service | `https://initio-learning-trust.github.io/slides-audio-recorder/terms.html` |

### 8. Publish

- **Private / internal:** press **Publish**. It appears in your organisation's Marketplace
  immediately, and a Workspace admin can install it for a whole OU from
  *Admin console ▸ Apps ▸ Google Workspace Marketplace apps*. No Google review, no OAuth
  verification — because the app is internal and the scopes are non-sensitive.
- **Public:** press **Publish** to submit for review. Expect an OAuth consent screen check and a
  Marketplace listing review. Because the add-on uses only non-sensitive scopes there is no
  security assessment, but Google will still check that the listing, privacy policy and scopes match
  what the app does. [OAUTH_SCOPES.md](OAUTH_SCOPES.md) is written to be pasted into the
  justification boxes.

---

## Shipping an update

```bash
npm run verify           # rebuild the protocol include, fail if stale, run the tests
npx clasp push
```

Then **Deploy ▸ Manage deployments ▸ Edit ▸ New version ▸ Deploy**, and update the **Version** field
in the Marketplace SDK App Configuration. Users get the new version the next time they open a
presentation; Editor add-ons do not need a re-install.

Changes to `recorder/` go live as soon as the Pages workflow finishes — no add-on redeploy needed —
so keep the message protocol backwards compatible or bump `VERSION` in `recorder/lib/protocol.js`
and ship both ends together.

## Rolling back

The Marketplace SDK's **Version** field is the switch: set it back to the previous version number
and save. The Apps Script deployment history keeps old versions indefinitely.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Sidebar says the browser blocked the recording window | Pop-up blocker | Allow pop-ups for `docs.google.com` |
| Recording window says the sidebar did not answer | Sidebar was closed or reloaded | Close the window, reopen the sidebar, press Record |
| Recording window says "Open this from Google Slides" | Opened directly, or `window.opener` was lost | Always start from the sidebar |
| "Drive refused the request (403)" with "API has not been used in project" | The Drive API is not enabled on the script's Cloud project | Enable it via the link in the message, or link a standard project (step 5) |
| "Drive refused the request (403)" with a quota message | Drive is full, or an admin policy blocks the API | Free space; check Drive API availability for the OU |
| Privacy policy 404s at `/privacy.html` | Pages is publishing from a branch, not from the workflow | Settings ▸ Pages ▸ Source ▸ GitHub Actions, then re-run the deploy |
| Sharing note says link sharing is blocked | Workspace policy forbids external link sharing | Use *Anyone in my organisation*, or share the file manually |
| `clasp push` fails with a manifest error | `appsscript.json` edited by hand | `npm run build`, check the JSON parses |
