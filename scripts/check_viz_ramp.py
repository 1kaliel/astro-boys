"""Check the sequential color ramp of the dashboard against the design-system rules (docs/design-system.md).

Reads the ramp and the surfaces from `app/frontend/src/styles/primitives.css` and checks, in CIELAB:

  1. lightness is strictly ordered along the ramp (more activity is always darker on light, lighter on dark);
  2. neighbouring steps stay apart (delta E), also as seen with protanopia, deuteranopia and tritanopia;
  3. the least-activity step is distinct from the "no data" color, in both themes, also under those
     deficiencies;
  4. the most-activity step stands out from the chart surface.

    uv run python scripts/check_viz_ramp.py  # exits 1 if a rule fails

Standard library only. Color vision deficiency is simulated with Machado et al. (2009), severity 1.0,
in linear RGB.
"""

from __future__ import annotations

import math
import re
import sys
from pathlib import Path

PRIMITIVES = Path(__file__).resolve().parent.parent / "app" / "frontend" / "src" / "styles" / "primitives.css"

RAMP_PREFIX = "magma"  # --magma-100 (palest) .. --magma-700 (darkest)
MIN_STEP_DE = 15.0  # neighbouring steps, normal vision
MIN_STEP_DE_CVD = 8.0  # neighbouring steps, color vision deficiencies
MIN_NULL_DE = 20.0  # least step against "no data", normal vision
MIN_NULL_DE_CVD = 8.0  # the same, color vision deficiencies
MIN_PEAK_CONTRAST = 4.5  # most-activity step against the chart surface

CVD = {
    "protanopia": (
        (0.152286, 1.052583, -0.204868),
        (0.114503, 0.786281, 0.099216),
        (-0.003882, -0.048116, 1.051998),
    ),
    "deuteranopia": (
        (0.367322, 0.860646, -0.227968),
        (0.280085, 0.672501, 0.047413),
        (-0.011820, 0.042940, 0.968881),
    ),
    "tritanopia": (
        (1.255528, -0.076749, -0.178779),
        (-0.078411, 0.930809, 0.147602),
        (0.004733, 0.691367, 0.303900),
    ),
}
RGB_TO_XYZ = ((0.4124, 0.3576, 0.1805), (0.2126, 0.7152, 0.0722), (0.0193, 0.1192, 0.9505))
WHITE = (0.95047, 1.0, 1.08883)

Vec = tuple[float, float, float]


def tokens(css: str) -> dict[str, str]:
    return {name: value.lower() for name, value in re.findall(r"--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})", css)}


def to_rgb(hex_color: str) -> Vec:
    return tuple(int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5))  # type: ignore[return-value]


def to_linear(rgb: Vec) -> Vec:
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)  # type: ignore[return-value]


def to_srgb(linear: Vec) -> Vec:
    out = []
    for c in linear:
        c = min(1.0, max(0.0, c))
        out.append(c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)
    return tuple(out)  # type: ignore[return-value]


def multiply(matrix: tuple[Vec, Vec, Vec], vec: Vec) -> Vec:
    return tuple(sum(m * v for m, v in zip(row, vec, strict=True)) for row in matrix)  # type: ignore[return-value]


def lab(rgb: Vec) -> Vec:
    xyz = multiply(RGB_TO_XYZ, to_linear(rgb))
    f = [
        math.cbrt(v / w) if v / w > 216 / 24389 else (24389 / 27 * (v / w) + 16) / 116
        for v, w in zip(xyz, WHITE, strict=True)
    ]
    return 116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])


def delta_e(a: Vec, b: Vec) -> float:
    return math.dist(lab(a), lab(b))


def simulate(rgb: Vec, kind: str) -> Vec:
    return to_srgb(multiply(CVD[kind], to_linear(rgb)))


def contrast(a: Vec, b: Vec) -> float:
    la, lb = (multiply(RGB_TO_XYZ, to_linear(c))[1] for c in (a, b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    t = tokens(PRIMITIVES.read_text())
    steps = [t.get(f"{RAMP_PREFIX}-{n}00") for n in range(1, 8)]
    if any(s is None for s in steps):
        print(f"FAIL: --{RAMP_PREFIX}-100 .. --{RAMP_PREFIX}-700 are not all defined in {PRIMITIVES.name}")
        return 1
    ramp = [to_rgb(s) for s in steps if s]  # palest first
    surfaces = {"light": (t["neutral-25"], t["neutral-200"]), "dark": (t["neutral-900"], t["neutral-850"])}
    failures: list[str] = []

    lightness = [lab(c)[0] for c in ramp]
    print("lightness L* (palest to darkest):", " ".join(f"{x:5.1f}" for x in lightness))
    if not all(a > b for a, b in zip(lightness, lightness[1:], strict=False)):
        failures.append("lightness is not strictly ordered along the ramp")

    views = {"normal vision": lambda c: c, **{k: (lambda c, k=k: simulate(c, k)) for k in CVD}}
    for view, see in views.items():
        limit = MIN_STEP_DE if view == "normal vision" else MIN_STEP_DE_CVD
        worst = min(delta_e(see(a), see(b)) for a, b in zip(ramp, ramp[1:], strict=False))
        print(f"  neighbouring steps, {view:13s}: min dE {worst:5.1f} (need {limit})")
        if worst < limit:
            failures.append(f"neighbouring steps too close under {view}: {worst:.1f} < {limit}")

    for mode, (surface_hex, null_hex) in surfaces.items():
        least = ramp[0] if mode == "light" else ramp[-1]  # dark theme flips the ramp: more activity = lighter
        most = ramp[-1] if mode == "light" else ramp[0]
        null = to_rgb(null_hex)
        for view, see in views.items():
            limit = MIN_NULL_DE if view == "normal vision" else MIN_NULL_DE_CVD
            de = delta_e(see(least), see(null))
            print(f"  {mode}: least step vs no-data, {view:13s}: dE {de:5.1f} (need {limit})")
            if de < limit:
                failures.append(f"{mode}: least step vs no data too close under {view}: {de:.1f} < {limit}")
        peak = contrast(most, to_rgb(surface_hex))
        print(f"  {mode}: most step vs chart surface: {peak:.2f}:1 (need {MIN_PEAK_CONTRAST}:1)")
        if peak < MIN_PEAK_CONTRAST:
            failures.append(f"{mode}: most step does not stand out from the surface: {peak:.2f}:1")

    print()
    if failures:
        print("FAIL:\n  " + "\n  ".join(failures))
        return 1
    print("OK: the sequential ramp passes every check")
    return 0


if __name__ == "__main__":
    sys.exit(main())
