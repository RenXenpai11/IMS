# Internship Management System

Svelte + Vite frontend with a Google Apps Script deployment flow powered by `clasp`.

## Local development

```bash
npm install
npm run dev
```

## Google Apps Script setup

1. Enable the Apps Script API: `https://script.google.com/home/usersettings`
2. Sign in with clasp:

```bash
npm run gas:login
```

3. Connect this repo to a script project.

Create a new Apps Script project:

```bash
npx clasp create --rootDir . --project ./appscript --title "Internship Management System"
```

Or clone an existing Apps Script project:

```bash
npx clasp clone YOUR_SCRIPT_ID --rootDir . --project ./appscript
```

If you prefer to create the config manually, copy `appscript/.clasp.json.example` to `appscript/.clasp.json` and replace `YOUR_SCRIPT_ID`.

## Main workflow

After the one-time `clasp login` + project link setup, your daily command can just be:

```bash
npm run deploy:gas
```

That command will:

- build the Svelte app
- generate the Apps Script-ready files in `appscript/`
- `clasp push` the generated code to your linked Google Apps Script project

Important:

- this pushes the code currently in your local working folder in VS Code
- it does not automatically deploy a Git branch unless that branch is the one currently checked out locally
- if you switch branches locally, then `npm run deploy:gas` will push that branch's current files

## Build and push

Generate the Apps Script-ready output:

```bash
npm run build:gas
```

Push the generated `appscript/` files to Apps Script:

```bash
npm run push:gas
```

Create or update a deployment:

```bash
npm run release:gas
```

Open the linked Apps Script project:

```bash
npm run gas:open
```

## How it works

- `vite build` creates the production frontend in `dist/`
- `scripts/prepare-gas.mjs` converts that build into a self-contained `appscript/Index.html`
- `appscript/Code.js` serves the app as a Google Apps Script web app
- `appscript/appsscript.json` defines the Apps Script manifest

## Deploy as a web app

After `npm run gas:push`, deploy from the Apps Script editor:

1. Open `Deploy > New deployment`
2. Choose `Web app`
3. Select the execution account and access level
4. Click `Deploy`

You can also create a deployment from the CLI with `npm run release:gas` (or `npm run gas:deploy`), then manage web app settings in the Apps Script UI if needed.
