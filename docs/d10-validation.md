# D10 validation

Reviewed for Jean Gustavo on 2026-11-15 at 08:57 UTC.

## Scope

Public URL: https://astro-dashboard-301238386836.us-central1.run.app/

PR: https://github.com/1kaliel/astro-boys/pull/47

The public application still shows the wording before PR 47. This review validates the existing public dialog's behavior, not the corrected branch in a running application. No merge or deployment was performed.

## Results

| Check | Result | Evidence / limit |
|---|---|---|
| Dialog opens | Pass | How to read opens the panel |
| English content | Pass for this panel | Five sections: What is shown, Reading the calendar, The views, Limitations, Sources and credits; not an audit of every app string |
| Scrolling | Pass | Home reveals the title; End reaches sources and Close |
| Close and Escape | Pass | Both close the panel; Escape returns focus to How to read |
| Desktop dark and light | Readable | Screenshots inspected at 1280 × 720; no formal contrast audit |
| Narrow viewport | Readable | 390 × 844, light theme; text wraps and Close is reachable. Desktop browser emulation, not a physical phone |
| Sources and disclaimer | Present | FIRMS, LANCE disclaimer and two algorithm DOI links are rendered; destination availability not revalidated in this review |
| Title visible immediately | Fail on public version | Initial scroll hides the heading; Home reveals it. PR 46 contains a scroll-margin change, which needs a deployed recheck |
| Corrected filter, CSV, colors and 2012 text | Not deployed | Old wording is still visible; PR 47 needs integration and deployment |
| CI for original PR 47 commit | Pass | All five checks passed for 590241a1016fb899b3871f53250619198b717c6d |

## Acceptance remaining

1. Pass CI on the latest PR commit.
2. Review and integrate PR 47 through the normal workflow.
3. Obtain Kali's approval for deployment.
4. Reopen the deployed panel and confirm the four wording corrections and the visible initial title, including a narrow viewport.
5. Mark D10 complete only after that recheck.

Review and documentation prepared with AI assistance, disclosed in resources.md. No data, model or numerical result was changed.

## Follow-up correction (09:02 UTC)

PR 47 now explicitly focuses the title on opening via Base UI's existing initialFocus prop and a title ref. The body stays keyboard-focusable. This addresses the observed scroll trigger in code; it has not yet been validated in a running corrected build. CI, deployment and the deployed recheck remain required.

## Release readiness recheck (2026-11-15, 09:17 UTC)

PR 47 was merged at 09:04 UTC as `bc2a21af0e1c4694e7a593d011a07c703ecc0d2f`. All five jobs passed for its final head `0b7731394da5ca6f6df7b76b2812bad06b3f1e42` ([CI](https://github.com/1kaliel/astro-boys/actions/runs/43697357256)); main's merge commit also passed [CI](https://github.com/1kaliel/astro-boys/actions/runs/43697426550).

The merged code already contains the four wording corrections in AboutDialog.tsx and explicit title initialFocus in InfoDialog.tsx. No additional code correction is needed merely to repeat those changes.

Repeated the public browser checks at 1280 x 720 and 390 x 844 (desktop emulation, not a physical phone). The public panel still has all four old passages and opens with its title above the visible scroll area. Home reveals the title; End reaches Sources and Close. Close works on desktop; Escape works at the narrow viewport and restores focus to How to read. Narrow text wraps within the panel. These results describe the old deployed app, not a running corrected build.

Local reproduction is blocked: git cannot resolve github.com, npm cannot resolve registry.npmjs.org, no cached React packages were found, and gcloud, Docker and make are unavailable. No local corrected-build visual pass is claimed.

### Publication handoff

Jean requested publication preparation. Cloud changes still require Kali under AGENTS.md; no approval from Kali for this release was found. No deployment or merge was performed in this recheck.

On an authenticated deployment workstation, after Kali approves:

1. Use a clean checkout containing `bc2a21a` or a later reviewed commit; record the exact SHA.
2. Follow [the existing Cloud Run runbook](../deploy/cloudrun/README.md). Keep the existing git-ignored project and service configuration, including ASTRO_HOTSPOTS_ROOT. Do not create new IAM bindings or replace the data with fixtures.
3. Pull calendar/v1 and month_to_date/v1 together. Run the deployment script in dry-run mode, then with BUILDER=cloudbuild and APPLY=1 after approval. Record the build, image and revision.
4. Check /api/healthz and /api/version, then open a fresh public page at desktop and narrow widths. Verify the title is visible immediately; NRT untyped exception; normalized/filtered native CSV; Count-only sequential color wording; and the qualified possible 2012 sensor step. Check scrolling, Close and Escape.
5. Only after that public recheck passes, mark D10 done through a PR and append a diary DONE entry with the deployed revision and results.

D10 remains in progress. This documentation was prepared with AI assistance; no data, model, metric or cloud configuration was changed.

## Deployed recheck: passed (2026-11-15, 09:30 UTC)

Kali approved the sixth deploy. It was built on Cloud Build from a clean checkout of `main` at `5ae8caa`
(`bc2a21a` plus the documentation of PR 49; the app code is the same), with `calendar/v1` and `month_to_date/v1`
pulled again just before (25 files, unchanged): build `65f7511b`, image `astro-dashboard:5ae8caa`, revision
`astro-dashboard-00006-bll`, 100% of the traffic, same configuration as the earlier revisions.

Service checks on the public URL: `/` 200, `/api/healthz` 200, `/api/version` gives `fb-l1-terra-rec-4` for the loaded
and the image model (1,838,338 rows, `month_to_date` 36,079 rows), `/api/hotspots/count` for 16 cells in 2013 gives
2,064 rows (read from the bucket). The only warnings in the revision log are two malformed test requests of this check
(422) and a missing `favicon.ico` (404).

Panel checks, in the browser on the public page:

| Check | 1280 × 720 dark | 1280 × 720 light | 390 × 844 light (emulated phone) |
|---|---|---|---|
| Title in view on opening (scroll position 0, focus on the title) | Pass | Pass | Pass |
| Four corrected passages shown, old passages absent | Pass | not repeated | Pass |
| Five sections, four links, one Close button | Pass | not repeated | Pass (sections) |
| Scrolling reaches the end and Close | Pass (End, Home, Page Down) | not repeated | Pass (wheel / touch scroll) |
| Close button closes and returns focus to "How to read" | Pass | not repeated | Pass |
| Escape closes and returns focus to "How to read" | Pass | Pass | Pass |
| No horizontal overflow of the panel or the page | Pass | not repeated | Pass |
| Console errors | not read | not read | None (read once, at the end of this run) |

The four passages were matched as text in the open panel: the untyped 2026 near-real-time exception, the two
"In Count mode" sentences, the possible artificial step around 2012, and the CSV as native detections normalized and
filtered by the pipeline. Positions, focus and text were read from the page; screenshots of the three layouts were
looked at but are not stored.

Limits: a desktop browser with an emulated phone viewport and user agent, not a physical phone; no screen reader; no
formal contrast audit; the link destinations were not opened. Seen in passing and not part of D10: at 390 px the model
badge in the app bar is cut at the right edge, and the site has no favicon.

D10 is done. Check and record made with an AI assistant for Kali; no data, model or metric was changed.

