import "../../styles/landing.css";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { cellsUrl, useRemote, type CellsResponse } from "../../data/api";
import { useCalendarDataset } from "../../data/useCalendar";
import { formatCompact, formatCount, formatLegendCount, MONTHS_SHORT } from "../../lib/format";
import { prefersReducedMotion, useColorScheme, useMediaQuery } from "../../lib/hooks";
import { applyTheme } from "../../lib/theme";
import { PILOT_BOUNDS } from "../../state/dashboard";
import { JumpChart, JumpTable, TotalsChart } from "./JumpChart";
import { boundsCenter } from "../../components/map/view";
import {
  BRAZIL_BOUNDS,
  BRAZIL_TIMELINES,
  timelineMonthLabel,
  type TimelineYear,
  BRAZIL_PREVIEW_URL,
  nextFrame,
  parseBrazilMonths,
  startFrame,
  TIMELINE_STEP_MS,
  type BrazilMonths,
  errorReductionPct,
  parseBrazilPreview,
  yearSpan,
  type BrazilPreview,
  foldWord,
  heroMonth,
  monthLabel,
  recordFigures,
  SENSOR_CHANGE_YEAR,
  sensorJump,
  yearlyTotals,
  type RecordFigures,
} from "./landingData";

// MapLibre is large: the text and figures paint first, the globe joins when its code arrives.
const HeroGlobe = lazy(() => import("./HeroGlobe").then((module) => ({ default: module.HeroGlobe })));

const STORY_ID = "how-it-works";
const BRAZIL_CENTER = boundsCenter(BRAZIL_BOUNDS);
const PILOT_CENTER = boundsCenter(PILOT_BOUNDS);
const EMBER_STEPS = [7, 6, 5, 4, 3, 2, 1];

export function LandingPage() {
  const [load] = useCalendarDataset(PILOT_BOUNDS, "ALL");
  const dataset = load.status === "ready" ? load.dataset : null;
  const months = dataset?.months;

  // "First look" section: the single-month preview file (yearly totals, development validation).
  const previewLoad = useRemote<unknown>(BRAZIL_PREVIEW_URL);
  const preview = useMemo((): BrazilPreview | null => {
    if (!previewLoad.data) return null;
    try {
      return parseBrazilPreview(previewLoad.data);
    } catch {
      return null;
    }
  }, [previewLoad.data]);
  const previewFailed = !previewLoad.loading && !preview;

  // The globe: the twelve months of 2024 over all of Brazil (experimental). If the file cannot be read, the pilot's
  // busiest month of the latest complete year from the API.
  const [timelineYear, setTimelineYear] = useState<TimelineYear>(BRAZIL_TIMELINES[0].year);
  const timelineFile = BRAZIL_TIMELINES.find((t) => t.year === timelineYear) ?? BRAZIL_TIMELINES[0];
  const timelineLoad = useRemote<unknown>(timelineFile.url);
  const timeline = useMemo((): BrazilMonths | null => {
    if (!timelineLoad.data) return null;
    try {
      return parseBrazilMonths(timelineLoad.data);
    } catch {
      return null;
    }
  }, [timelineLoad.data]);
  const timelineFailed = !timelineLoad.loading && !timeline;
  // While another year loads, the previous one stays on screen (dimmed through `switching`).
  const switching = Boolean(timeline && timeline.year !== timelineYear);
  const shownFile = BRAZIL_TIMELINES.find((t) => t.year === timeline?.year) ?? timelineFile;
  const pilotMonth = useMemo(() => (months ? heroMonth(months) : null), [months]);
  const cells = useRemote<CellsResponse>(timelineFailed && pilotMonth ? cellsUrl("ALL", pilotMonth) : null);
  const frames = useMemo(
    () => (timeline ? timeline.months.map((m) => m.cells) : cells.data ? [cells.data.cells] : []),
    [timeline, cells.data],
  );
  const globeBreaks = timeline ? timeline.breaks : (cells.data?.breaks ?? []);
  const figures = useMemo(
    () => (dataset ? recordFigures(dataset.months, dataset.firstYear, dataset.lastYear) : null),
    [dataset],
  );
  const years = useMemo(() => (months ? yearlyTotals(months) : []), [months]);
  const jump = useMemo(() => sensorJump(years), [years]);

  // Motion: the timeline plays and the globe turns by default; Pause stops both. Reduced motion: still, September.
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compactChart = useMediaQuery("(max-width: 37.5rem)");
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);
  const [frame, setFrame] = useState<number | null>(null);
  const count = timeline?.months.length ?? 0;
  const current = timeline ? (frame ?? startFrame(timeline.months, playing)) : 0;
  useEffect(() => {
    if (!timeline || !playing) return;
    const id = window.setInterval(
      () => setFrame((f) => nextFrame(f ?? startFrame(timeline.months, true), timeline.months.length)),
      TIMELINE_STEP_MS,
    );
    return () => window.clearInterval(id);
  }, [timeline, playing]);
  const chooseYear = (year: TimelineYear) => {
    if (year === timelineYear) return;
    setTimelineYear(year);
    setFrame(null);
  };
  // A new file: start it from its first month (or September when still).
  useEffect(() => setFrame(null), [timeline]);
  const togglePlay = () => {
    setFrame(current);
    setPlaying((value) => !value);
  };

  const toStory = () => {
    const target = document.getElementById(STORY_ID);
    if (!target) return;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
  };

  const tMonth = timeline?.months[current] ?? null;
  const shownMonth = timeline && tMonth ? { year: timeline.year, month: tMonth.month } : timelineFailed ? pilotMonth : null;
  const monthText = timeline && tMonth ? timelineMonthLabel(timeline.year, tMonth) : shownMonth ? monthLabel(shownMonth) : null;
  const monthShort = shownMonth ? `${MONTHS_SHORT[shownMonth.month - 1]} ${shownMonth.year}` : "";
  const globeLabel = timeline
    ? `Interactive globe of Brazil: VIIRS-equivalent hotspots per 0.25 degree cell, month by month through ${timeline.year}, from an experimental, not validated, run. Lighter cells had more detections. A dashed box marks the validated Northeast pilot. Drag to turn it; use the timeline to change month.`
    : monthText
      ? `Interactive globe of Northeast Brazil, VIIRS-equivalent hotspots per 0.25 degree cell in ${monthText}. Lighter cells had more detections. A dashed outline marks the validated pilot area.`
      : "Interactive globe of Brazil. A dashed box marks the validated Northeast pilot.";

  return (
    <div className="landing">
      <a className="landing-skip" href="#explore">
        Skip to the explorer
      </a>
      <LandingHeader />

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-globe" role="region" aria-label={globeLabel}>
            <Suspense fallback={null}>
              <HeroGlobe
                frames={frames}
                frame={current}
                breaks={globeBreaks}
                playing={playing && !reduced}
                focus={timelineFailed ? PILOT_CENTER : BRAZIL_CENTER}
                labelPilot={!timelineFailed}
                monthShort={monthShort}
                experimental={Boolean(timeline)}
              />
            </Suspense>
          </div>
          <div className="hero-scrim" aria-hidden="true" />

          <div className="hero-content">
            <p className="hero-eyebrow">NASA Space Apps 2026 · MODIS + VIIRS hotspots</p>
            <h1 id="hero-title" className="hero-title">
              24 years of fire activity in Brazil, on one scale.
            </h1>
            <p className="hero-sub">
              Validated for the Northeast pilot; all of Brazil is a first experimental run.
            </p>
            <HeroFigures figures={figures} failed={load.status === "error"} />
            <div className="hero-actions">
              <a className="landing-button landing-button-primary" href="#explore">
                Explore the data
              </a>
              <button type="button" className="landing-button landing-button-quiet" onClick={toStory}>
                How it works
              </button>
            </div>
          </div>

          <div className="hero-caption">
            {timeline && tMonth ? (
              <div className={switching ? "hero-timeline is-switching" : "hero-timeline"} aria-busy={switching}>
                <div className="timeline-years" role="group" aria-label="Year on the globe">
                  {BRAZIL_TIMELINES.map((t) => (
                    <button
                      key={t.year}
                      type="button"
                      className="timeline-year"
                      aria-pressed={timelineYear === t.year}
                      onClick={() => chooseYear(t.year)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="hero-month">
                  <span className="hero-month-name">{monthText}</span>
                  {tMonth.partial && <span className="hero-month-partial">partial</span>}
                  <span className="hero-month-total">{formatLegendCount(tMonth.total)} hotspots</span>
                </p>
                <div className="timeline-controls">
                  <button
                    type="button"
                    className="timeline-play"
                    onClick={togglePlay}
                    aria-label={playing ? "Pause the timeline and the globe" : "Play the timeline"}
                  >
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
                      {playing ? (
                        <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
                      ) : (
                        <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
                      )}
                    </svg>
                    <span>{playing ? "Pause" : "Play"}</span>
                  </button>
                  <div className="timeline-track">
                    <input
                      type="range"
                      className="timeline-slider"
                      min={0}
                      max={count - 1}
                      step={1}
                      value={current}
                      onChange={(event) => {
                        setPlaying(false);
                        setFrame(Number(event.target.value));
                      }}
                      aria-label={`Month of ${timeline.year}`}
                      aria-valuetext={`${monthText}${tMonth.partial ? " (partial)" : ""}, ${formatCount(tMonth.total)} hotspots`}
                    />
                    <div className="timeline-ticks" aria-hidden="true">
                      {timeline.months.map((m, i) => (
                        <span key={m.month} className={i === current ? "is-current" : undefined}>
                          {MONTHS_SHORT[m.month - 1].slice(0, 1)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="hero-caption-text">
                  Globe: <strong>{monthText}</strong>, all of Brazil — experimental run, not validated
                  {shownFile.note ? `; ${shownFile.note}` : ""}. Dashed box: the validated Northeast pilot. Drag to turn,
                  hover a cell for its count.
                </p>
              </div>
            ) : (
              <p className="hero-caption-text">
                {monthText ? (
                  <>
                    Globe: <strong>{monthText}</strong>, Northeast pilot, VIIRS-equivalent hotspots per 0.25° cell
                    {cells.loading && !cells.data ? " (loading)" : ""}
                  </>
                ) : (
                  "Globe: loading the months…"
                )}
              </p>
            )}
            <div className="hero-legend" aria-hidden="true">
              <span>fewer</span>
              <span className="hero-legend-ramp">
                {EMBER_STEPS.map((step) => (
                  <i key={step} style={{ background: `var(--ember-${step}00)` }} />
                ))}
              </span>
              <span>more</span>
            </div>
            <div className="hero-caption-row">
              {!timeline && !reduced && (
                <button type="button" className="hero-motion" aria-pressed={!playing} onClick={togglePlay}>
                  {playing ? "Pause motion" : "Resume motion"}
                </button>
              )}
              <span className="hero-credit">
                Basemap ©{" "}
                <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
                  OpenFreeMap
                </a>{" "}
                ©{" "}
                <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">
                  OpenMapTiles
                </a>{" "}
                ©{" "}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                  OpenStreetMap
                </a>
              </span>
            </div>
          </div>
        </section>

        <section className="story story-jump" aria-labelledby="jump-title">
          <div className="story-inner">
            <h2 id="jump-title" className="story-title">
              In {SENSOR_CHANGE_YEAR} the record jumps {jump ? foldWord(jump.rawRatio) : ""}.{" "}
              <span className="story-title-turn">The satellite changed, not the fires.</span>
            </h2>
            <JumpText years={years} />
            <figure className="jump-figure">
              {years.length > 1 ? (
                <>
                  <JumpChart rows={years} compact={compactChart} />
                  <JumpTable rows={years} />
                </>
              ) : (
                <div className="jump-placeholder" role="status">
                  {load.status === "error" ? "The yearly totals could not be loaded right now." : "Loading the yearly totals…"}
                </div>
              )}
              <figcaption>
                Hotspot detections per year, Northeast pilot, complete years only. Raw: the count of the satellite in
                use that year. Harmonized: every year on the VIIRS scale.
              </figcaption>
            </figure>
          </div>
        </section>

        <section id={STORY_ID} className="story story-how" aria-labelledby="how-title" tabIndex={-1}>
          <div className="story-inner">
            <h2 id="how-title" className="story-title">
              How it works
            </h2>
            <ol className="how-steps">
              <li className="how-step">
                <h3>NASA detects</h3>
                <p>
                  MODIS and VIIRS instruments flag hot pixels from orbit, day and night. NASA FIRMS publishes every
                  detection.
                </p>
              </li>
              <li className="how-step">
                <h3>We harmonize</h3>
                <p>
                  Older MODIS Aqua counts are converted to the VIIRS scale, per 0.25° cell and month. On a test period
                  opened only once (2022–2023): <strong>18% lower error per cell</strong> than the best simple
                  conversion.
                </p>
              </li>
              <li className="how-step">
                <h3>You explore</h3>
                <p>A calendar by year, month and day, a map down to the cell, your own area, and downloads.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="story story-read" aria-labelledby="read-title">
          <div className="story-inner read-grid">
            <h2 id="read-title" className="read-title">
              Read it right
            </h2>
            <p>
              <strong>A hotspot is a satellite detection</strong>, not a fire and not burned area. One fire can make
              many hotspots; clouds and smoke can hide one.
            </p>
            <p>
              <strong>Exploratory, not an alert system.</strong> It compares months and years. It does not predict or
              warn.
            </p>
          </div>
        </section>

        <BrazilSection preview={preview} failed={previewFailed} compact={compactChart} />

        <section className="story story-end" aria-labelledby="end-title">
          <div className="story-inner">
            <h2 id="end-title" className="end-title">
              Pick a month. Pick an area. See it on one scale.
            </h2>
            <a className="landing-button landing-button-ink" href="#explore">
              Open the explorer
            </a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="story-inner">
          <p>
            Data:{" "}
            <a href="https://earthdata.nasa.gov/firms" target="_blank" rel="noreferrer">
              NASA FIRMS
            </a>{" "}
            (MODIS Collection 6/6.1, VIIRS 375 m Collection 2).
          </p>
          <p>
            We acknowledge the use of data from the NASA LANCE FIRMS, part of the NASA Earth Science Data and
            Information System (ESDIS). See the{" "}
            <a href="https://www.earthdata.nasa.gov/data/projects/lance/disclaimer" target="_blank" rel="noreferrer">
              LANCE disclaimer
            </a>
            . NASA does not endorse this project.
          </p>
          <p className="landing-basemap-credit">
            Globe basemap ©{" "}
            <a href="https://openfreemap.org" target="_blank" rel="noreferrer">
              OpenFreeMap
            </a>{" "}
            ©{" "}
            <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">
              OpenMapTiles
            </a>{" "}
            ©{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>{" "}
            contributors.
          </p>
        </div>
      </footer>
    </div>
  );
}

function LandingHeader() {
  const scheme = useColorScheme();
  const next = scheme === "dark" ? "light" : "dark";
  const label = `Switch to ${next} theme`;
  return (
    <header className="landing-header">
      {/* The header sits over the dark scene in both themes: always the light-on-dark (negative) logo. */}
      <a className="landing-logo" href="#home">
        <img src="/brand/firewatcher-logo-horizontal-compacto-negativo.svg" alt="FIREWATCHER" />
      </a>
      <nav className="landing-nav" aria-label="Landing">
        <button type="button" className="landing-icon-button" onClick={() => applyTheme(next)} aria-label={label} title={label}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path
              d={
                scheme === "dark"
                  ? "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
                  : "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"
              }
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <a className="landing-nav-link" href="#explore">
          Explore
        </a>
      </nav>
    </header>
  );
}

function HeroFigures({ figures, failed }: { figures: RecordFigures | null; failed: boolean }) {
  const pending = failed ? "–" : "…";
  const span = figures ? `${figures.firstYear}–${figures.lastYear}` : "2002–2026";
  return (
    <dl className="hero-figures" aria-busy={!figures && !failed}>
      <div>
        <dt>VIIRS-equivalent hotspots, Northeast {span}</dt>
        <dd>{figures ? formatCompact(figures.total) : pending}</dd>
      </div>
      <div>
        <dt>
          Peak month, Northeast
          {figures?.peak
            ? `, ${formatLegendCount(figures.peak.count)} hotspots${figures.peak.estimated ? " (estimated from MODIS)" : ""}`
            : ""}
        </dt>
        <dd>{figures?.peak ? `${MONTHS_SHORT[figures.peak.month - 1]} ${figures.peak.year}` : pending}</dd>
      </div>
      <div>
        <dt>
          {figures
            ? `of ${figures.judged} complete Northeast months above their usual level`
            : "Northeast months above their usual level"}
        </dt>
        <dd>{figures ? figures.above : pending}</dd>
      </div>
      {failed && <p className="hero-figures-note">Figures unavailable right now. The explorer may still load.</p>}
    </dl>
  );
}

function JumpText({ years }: { years: ReturnType<typeof yearlyTotals> }) {
  const jump = sensorJump(years);
  if (!jump) {
    return (
      <p className="story-lede">
        Read as one record, the archive steps up when VIIRS replaces MODIS. Harmonized, the years line up.
      </p>
    );
  }
  const earlier = years.filter((r) => r.year < SENSOR_CHANGE_YEAR).map((r) => r.harmonized);
  const low = Math.min(...earlier);
  const high = Math.max(...earlier);
  const inside = jump.after.harmonized >= low && jump.after.harmonized <= high;
  return (
    <p className="story-lede">
      Read as one record, the archive goes from <strong>{formatLegendCount(jump.before.raw)}</strong> detections in{" "}
      {jump.before.year} (MODIS Aqua) to <strong>{formatLegendCount(jump.after.raw)}</strong> in {jump.after.year}{" "}
      (VIIRS S-NPP): VIIRS pixels are 375 m against MODIS’s 1 km, so it flags far more of them. Harmonized,{" "}
      {jump.after.year} has {formatLegendCount(jump.after.harmonized)}
      {inside
        ? `, inside the range of the years before it (${formatLegendCount(low)} to ${formatLegendCount(high)}).`
        : ` against ${formatLegendCount(jump.before.harmonized)} in ${jump.before.year}.`}
    </p>
  );
}

function BrazilSection({ preview, failed, compact }: { preview: BrazilPreview | null; failed: boolean; compact: boolean }) {
  const gain = preview ? errorReductionPct(preview.devValidation.mae, preview.devValidation.bestBaselineMae) : null;
  const rows = preview?.yearlyTotals ?? [];
  return (
    <section className="story story-brazil" aria-labelledby="brazil-title">
      <div className="story-inner">
        <p className="brazil-badge">Experimental</p>
        <h2 id="brazil-title" className="story-title">
          First look: all of Brazil
        </h2>
        <p className="story-lede">
          The same frozen method, run over every 0.25° cell of Brazil. It has not been checked on a blind test yet, so
          read it as a preview, not a result.
        </p>
        {preview ? (
          <>
            <dl className="brazil-facts">
              <div>
                <dt>0.25° cells</dt>
                <dd>{preview.cellsTotal.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Record</dt>
                <dd>
                  {MONTHS_SHORT[preview.firstMonth.month - 1]} {preview.firstMonth.year} –{" "}
                  {MONTHS_SHORT[preview.lastMonth.month - 1]} {preview.lastMonth.year}
                </dd>
              </div>
              {gain != null && gain > 0 && (
                <div>
                  <dt>
                    lower per-cell error than the best simple conversion, on the {yearSpan(preview.devValidation.years)}{" "}
                    development years, not the blind test
                  </dt>
                  <dd>{gain}%</dd>
                </div>
              )}
            </dl>
            {rows.length > 1 && (
              <figure className="jump-figure">
                <TotalsChart rows={rows} compact={compact} label="Brazil" />
                <div className="sr-only">
                  <table>
                    <caption>VIIRS-equivalent hotspots per year, all of Brazil, experimental run</caption>
                    <thead>
                      <tr>
                        <th scope="col">Year</th>
                        <th scope="col">Hotspots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.year}>
                          <th scope="row">{r.year}</th>
                          <td>{r.total.toLocaleString("en-US")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <figcaption>
                  VIIRS-equivalent hotspot detections per year, all of Brazil, {rows[0].year}–{rows[rows.length - 1].year}.
                  Experimental run, not validated.
                </figcaption>
              </figure>
            )}
          </>
        ) : (
          <p className="jump-placeholder brazil-placeholder" role="status">
            {failed ? "The Brazil-wide preview could not be loaded right now." : "Loading the Brazil-wide preview…"}
          </p>
        )}
        <p className="brazil-next">The explorer shows the validated Northeast; Brazil-wide in the explorer is the next step.</p>
      </div>
    </section>
  );
}
