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
