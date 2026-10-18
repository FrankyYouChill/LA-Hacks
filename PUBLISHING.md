# Publish the Workshop Source

Keep the two stages under `voice-agent/`. The English repository homepage points participants to that guide, then Stage 1 and Stage 2.

## Source to include

Include `README.md`, this guide, `.gitignore`, `.github/`, `docs/`, the `voice-agent/` source and both stage lockfiles. The original Python/shell examples and their configuration example can remain alongside the workshop.

Keep actual `.env` files, `node_modules`, generated `outputs`, local presentation working folders and root-level reference PDFs/slides out of the source release. The ignore rules cover these, including the old `voice-agent/outputs` symlink. Files remain available locally.

**GitHub's browser upload does not apply your local `.gitignore`.** Upload only the prepared source export, or use Git so its ignore rules are applied. If using a source ZIP, extract it first and upload the files inside its `LA-Hacks/` folder; committing the ZIP itself does not create the workshop's browsable source tree.

## Preserve the existing GitHub repository

The development folder is currently a local source directory, without Git history. To publish into the existing repository, clone it into a separate folder first:

```bash
git clone https://github.com/FrankyYouChill/LA-Hacks.git LA-Hacks-publish
cd LA-Hacks-publish
```

Copy the reviewed source export into this checkout, including `.gitignore` and `.github/`, while keeping the checkout's `.git` directory. Review existing repository files before replacing anything. Then inspect:

```bash
git status --short
git diff --stat
```

Stage and review the intended changes before committing. Inspect `git diff --cached --name-only` and confirm no real environment files, dependency folders or generated media are listed. Publishing remains a separate action; preparing and checking this source does not push it.

The `private: true` fields in each `package.json` prevent accidental npm publication. They do not prevent publishing the source on GitHub.

## Check the uploaded result

After publishing, use a fresh clone or GitHub's **Download ZIP** and follow the [participant guide](voice-agent/README.md). Keep this exact structure:

```text
LA-Hacks/
  README.md
  .github/workflows/workshop-checks.yml
  voice-agent/
    README.md
    .env.example
    01-basic-agent/
    02-multimodal-agent/
```

In each stage, `npm ci`, `npm run check` and `npm test` should pass without model credentials. Configure your own StepFun key in `voice-agent/.env` only when running the interactive app or optional live checks.

The GitHub Actions workflow runs those offline checks for both stages on Node.js 24 across Linux, macOS and Windows. Its first hosted results are available after the source is uploaded; local macOS checks do not establish that the hosted jobs have passed. No StepFun or Tavily secret is needed by the workflow, and it does not run the paid smoke scripts.

## Rehearse before the session

Follow [the acceptance walkthrough](voice-agent/ACCEPTANCE.md) using the laptop, browser, audio output and network you will present with. Confirm:

- Stage 1: browser demos, a real failed-check/revision loop, saved-file downloads and model details. Optional terminal: `npm run chat`.
- Stage 2: one-click production, music underneath narration, aligned individual tracks and an older take.
- Stage 2: the poster opens a draft-only request; ordinary chat does not generate audio.
- Credentials: Step 5 Preview, TTS and Gen are available on the presenting account.

Tavily search needs a separate key and live check. The dedicated Music adapter is optional and has not completed a live task in this environment. Keep the default TTS + Gen + Node.js mixer as the demonstration path.
