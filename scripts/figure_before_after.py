#!/usr/bin/env python3
"""Before/after chart: the raw hotspot record joined at 2012, and the harmonized record.

Reads the calendar (`processed/calendar/<version>`) and the monthly counts, sums the whole pilot extent by
year, and writes a PNG, an SVG and the plotted numbers as JSON to artifacts/figures/.

    uv sync --extra figures
    uv run python scripts/figure_before_after.py
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import duckdb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import FuncFormatter  # noqa: E402

SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3de"
VIIRS, MODIS, JOIN = "#2a78d6", "#eb6834", "#9a9992"  # categorical slots 1 and 2; neutral for the join


def yearly(calendar: str, counts: str) -> list[dict]:
    con = duckdb.connect()
    rows = con.execute(
        f"""
        WITH cal AS (
            SELECT year, sum(count_harmonized) AS harmonized,
                   sum(count_harmonized) FILTER (WHERE is_estimated) AS estimated_part,
                   sum(raw_snpp) AS snpp, bool_and(is_estimated) AS all_estimated,
                   count(DISTINCT month) FILTER (WHERE is_partial) AS partial_months,
                   any_value(model_version) AS model_version
            FROM read_parquet('{calendar}/**/*.parquet', hive_partitioning = true)
            WHERE period = 'ALL' GROUP BY year
        ),
        aqua AS (
            SELECT year, sum(n_hotspots) AS aqua
            FROM read_parquet('{counts}/**/*.parquet', hive_partitioning = true)
            WHERE satellite = 'Aqua' GROUP BY year
        )
        SELECT year, aqua, snpp, harmonized, estimated_part, all_estimated, partial_months, model_version
        FROM cal JOIN aqua USING (year) ORDER BY year
        """
    ).fetchall()
    names = ("year", "modis_aqua_raw", "viirs_snpp_observed", "harmonized", "estimated_part",
             "all_estimated", "partial_months", "model_version")  # counts are detections per year
    return [dict(zip(names, r, strict=True)) for r in rows]


def draw(data: list[dict], out: Path) -> None:
    years = [d["year"] for d in data]
    est = [d for d in data if d["all_estimated"]]
    obs = [d for d in data if not d["all_estimated"]]
    first_obs = obs[0]
    ratio = sum(d["viirs_snpp_observed"] for d in obs) / sum(d["modis_aqua_raw"] for d in obs)

    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "text.color": INK,
                         "axes.edgecolor": GRID, "axes.labelcolor": INK_2, "xtick.color": INK_2,
                         "ytick.color": INK_2, "svg.fonttype": "none"})
    fig, axes = plt.subplots(1, 2, figsize=(13, 6.6), sharey=True, facecolor=SURFACE)
    fig.subplots_adjust(left=0.07, right=0.975, top=0.80, bottom=0.25, wspace=0.07)
    line = {"linewidth": 2, "solid_capstyle": "round", "solid_joinstyle": "round"}
    dot = {"marker": "o", "markersize": 8, "markeredgecolor": SURFACE, "markeredgewidth": 2}

    left, right = axes
    # Before: what you get by reading the archive as one record.
    jump_from, jump_to = est[-1]["modis_aqua_raw"], first_obs["viirs_snpp_observed"]
    left.plot([est[-1]["year"], first_obs["year"]], [jump_from, jump_to],
              color=JOIN, linewidth=1.5, linestyle=(0, (2, 3)), zorder=1)
    left.plot([d["year"] for d in est], [d["modis_aqua_raw"] for d in est],
              color=MODIS, **line, **dot, zorder=3)
    left.plot([d["year"] for d in obs], [d["viirs_snpp_observed"] for d in obs],
              color=VIIRS, **line, **dot, zorder=3)
    left.text(2003, 215_000, "MODIS Aqua\n(1 km), as recorded", color=INK, fontsize=10.5,
              va="bottom", ha="left")
    left.text(2025, obs[-1]["viirs_snpp_observed"] + 55_000, "VIIRS S-NPP\n(375 m), as recorded",
              color=INK, fontsize=10.5, va="bottom", ha="right")
    left.annotate("Instrument change,\nnot a change in\nfire activity",
                  xy=(2011.45, (jump_from + jump_to) / 2), xytext=(2003.6, 640_000), color=INK_2,
                  fontsize=10.5, va="center", ha="left",
                  arrowprops={"arrowstyle": "-", "color": JOIN, "linewidth": 1, "shrinkA": 6, "shrinkB": 4})
    left.set_title("Before: the raw record, joined at 2012", loc="left", fontsize=12.5, color=INK, pad=10,
                   fontweight="bold")

    # After: one scale.
    right.plot([d["year"] for d in est] + [first_obs["year"]],
               [d["harmonized"] for d in est] + [first_obs["harmonized"]],
               color=VIIRS, linewidth=2, linestyle=(0, (4, 2.5)), zorder=2)
    right.plot([d["year"] for d in est], [d["harmonized"] for d in est], linestyle="none", marker="o",
               markersize=8, markerfacecolor=SURFACE, markeredgecolor=VIIRS, markeredgewidth=2, zorder=3)
    right.plot([d["year"] for d in obs], [d["harmonized"] for d in obs], color=VIIRS, **line, **dot, zorder=3)
    right.plot([d["year"] for d in data], [d["modis_aqua_raw"] for d in data], color=MODIS,
               linewidth=1.25, alpha=0.55, zorder=1)
    right.text(2003.0, 1_045_000, "Estimated from MODIS\n(VIIRS-equivalent)", color=INK, fontsize=10.5,
               va="bottom", ha="left")
    right.text(2025, obs[-1]["harmonized"] + 55_000, "Observed by\nVIIRS S-NPP", color=INK, fontsize=10.5,
               va="bottom", ha="right")
    right.text(2025, data[-1]["modis_aqua_raw"] + 30_000, "MODIS Aqua, as recorded", color=INK_2,
               fontsize=9.5, va="bottom", ha="right")
    right.set_title("After: harmonized to the VIIRS scale", loc="left", fontsize=12.5, color=INK, pad=10,
                    fontweight="bold")

    for ax in axes:
        ax.set_facecolor(SURFACE)
        ax.axvline(2011.5, color=GRID, linewidth=1, zorder=0)
        ax.grid(axis="y", color=GRID, linewidth=1)
        ax.set_axisbelow(True)
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)
        ax.tick_params(length=0, labelsize=10)
        ax.set_xlim(min(years) - 0.8, max(years) + 0.8)
        ax.set_xticks([y for y in years if y % 3 == 0])
        ax.set_ylim(0, 1_200_000)
        ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 1000:,.0f}"))
    left.set_ylabel("Hotspot detections per year (thousands)", fontsize=10.5)

    fig.text(0.07, 0.945, "The 2012 jump in the hotspot record is the instrument, not the fire activity",
             fontsize=16, fontweight="bold", color=INK, ha="left")
    subtitle = (f"Northeast Brazil, {min(years)}–{max(years)}. VIIRS records about {ratio:.1f} times as many "
                f"detections as MODIS Aqua over the same years ({obs[0]['year']}–{obs[-1]['year']}).")
    fig.text(0.07, 0.895, subtitle, fontsize=11.5, color=INK_2, ha="left")

    handles = [
        plt.Line2D([], [], color=MODIS, **line, **dot, label="MODIS Aqua, as recorded"),
        plt.Line2D([], [], color=VIIRS, **line, **dot, label="VIIRS S-NPP, observed"),
        plt.Line2D([], [], color=VIIRS, linewidth=2, linestyle=(0, (4, 2.5)), marker="o", markersize=8,
                   markerfacecolor=SURFACE, markeredgecolor=VIIRS, markeredgewidth=2,
                   label="VIIRS-equivalent, estimated from MODIS Aqua (and Terra as witness)"),
    ]
    fig.legend(handles=handles, loc="lower left", bbox_to_anchor=(0.065, 0.125), ncol=3, frameon=False,
               fontsize=10, labelcolor=INK_2, handlelength=2.6, columnspacing=2.2)
    partial = [str(d["year"]) for d in data if d["partial_months"]]
    fig.text(0.07, 0.035,
             "Source: NASA FIRMS active fire detections (MODIS Aqua and Terra; VIIRS S-NPP 375 m), presumed "
             "vegetation fires, nominal and high confidence, pilot bounding box.\n"
             f"Estimates: model {data[0]['model_version']}, calibrated on 2012–2019; uncertainty intervals "
             f"not shown yet. January 2012 is estimated. {' and '.join(partial)} include months with S-NPP "
             "outages.\n"
             "A detection is not a fire and not burned area. Chart code written with AI assistance.",
             fontsize=8.6, color=INK_2, ha="left", va="bottom", linespacing=1.45)

    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out.with_suffix(".png"), dpi=200, facecolor=SURFACE)
    fig.savefig(out.with_suffix(".svg"), facecolor=SURFACE)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--calendar", default="data/processed/calendar/v1")
    parser.add_argument("--counts", default="data/processed/cell_month_counts/v1")
    parser.add_argument("--out", type=Path, default=Path("artifacts/figures/before_after_2012"))
    args = parser.parse_args()
    data = yearly(args.calendar, args.counts)
    draw(data, args.out)
    args.out.with_suffix(".json").write_text(json.dumps(data, indent=2, default=float) + "\n")
    print(f"wrote {args.out}.png, .svg and .json ({len(data)} years)")


if __name__ == "__main__":
    main()
