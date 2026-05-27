#!/usr/bin/env python3
"""
Variable-MA Cam Profile Generator
Solves: given fixed-direction input force, compute cam curve r(θ)
that delivers a desired mechanical advantage profile MA(θ) through stroke.

Outputs SVG with cam profile, force vectors, MA overlay, annotations.

Math:
  Force F applied in fixed direction (e.g. horizontal pull).
  Cam contact point at polar coords (r(θ), θ).
  Perpendicular distance from pivot to force line → MA.
  For horizontal force: MA(θ) = r(θ) * |sin(θ)|
  Therefore: r(θ) = MA_desired(θ) / |sin(θ)|
"""
import math
import sys
from dataclasses import dataclass
from typing import Callable
import os

# ═══════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════
@dataclass
class CamParams:
    force_angle_deg: float = 0      # force direction (0 = horizontal +x)
    stroke_start_deg: float = 20    # start of useful stroke
    stroke_end_deg: float = 80      # end of useful stroke
    ma_min: float = 1.0             # MA at stroke start
    ma_max: float = 3.0             # MA at stroke end
    ma_profile: str = "linear"      # linear | quadratic | exponential | constant
    pivot_radius: float = 0.5       # physical pivot size (drawing)
    num_points: int = 200           # curve resolution


def ma_desired(theta_deg: float, params: CamParams) -> float:
    """Compute desired MA at a given rotation angle."""
    t = (theta_deg - params.stroke_start_deg) / (params.stroke_end_deg - params.stroke_start_deg)
    t = max(0, min(1, t))

    if params.ma_profile == "constant":
        return params.ma_min
    elif params.ma_profile == "linear":
        return params.ma_min + (params.ma_max - params.ma_min) * t
    elif params.ma_profile == "quadratic":
        return params.ma_min + (params.ma_max - params.ma_min) * t * t
    elif params.ma_profile == "exponential":
        if params.ma_min <= 0:
            params.ma_min = 0.1
        return params.ma_min * (params.ma_max / params.ma_min) ** t
    return params.ma_min


def compute_cam(params: CamParams):
    """Compute cam profile points (x, y) and MA curve."""
    points = []
    ma_curve = []

    force_rad = math.radians(params.force_angle_deg)

    for i in range(params.num_points):
        theta_deg = params.stroke_start_deg + (params.stroke_end_deg - params.stroke_start_deg) * i / (params.num_points - 1)
        theta_rad = math.radians(theta_deg)

        ma = ma_desired(theta_deg, params)

        # MA = r * |sin(theta - force_angle)|
        sin_term = abs(math.sin(theta_rad - force_rad))
        if sin_term < 0.001:
            r = params.ma_max * 8  # cap near dead zone
        else:
            r = ma / sin_term
            r = min(r, params.ma_max * 8)  # prevent runaway

        x = r * math.cos(theta_rad)
        y = r * math.sin(theta_rad)

        points.append((x, y, theta_deg, r, ma))
        ma_curve.append((theta_deg, ma))

    return points, ma_curve


# ═══════════════════════════════════════════════════════════════
# SVG RENDERER
# ═══════════════════════════════════════════════════════════════
def render_svg(params: CamParams, points, ma_curve, output_path: str):
    """Generate annotated SVG of the cam profile."""
    # Scale to fit
    max_r = max(p[3] for p in points) * 1.15
    padding = 60
    view_size = 720
    scale = (view_size - 2 * padding) / (2 * max_r)
    cx = view_size / 2
    cy = view_size / 2

    def tx(x, y):
        return (cx + x * scale, cy - y * scale)

    lines = []
    def L(s):
        lines.append(s)

    L(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_size} {view_size}" '
      f'width="{view_size}" height="{view_size}" font-family="monospace">')
    L('<rect width="100%" height="100%" fill="#0d1117"/>')

    # Grid
    grid_step = 2.0
    for g in range(-int(max_r), int(max_r) + 1, int(grid_step)):
        if g == 0:
            continue
        sx, sy = tx(g, 0)
        ex, ey = tx(g, 0)
        L(f'<line x1="{padding}" y1="{sy}" x2="{view_size - padding}" y2="{sy}" stroke="#21262d" stroke-width="0.5"/>')
        sx, sy = tx(0, g)
        L(f'<line x1="{sx}" y1="{padding}" x2="{sx}" y2="{view_size - padding}" stroke="#21262d" stroke-width="0.5"/>')

    # Axes
    sx, sy = tx(-max_r, 0)
    ex, ey = tx(max_r, 0)
    L(f'<line x1="{sx}" y1="{sy}" x2="{ex}" y2="{ey}" stroke="#484f58" stroke-width="1"/>')
    sx, sy = tx(0, -max_r)
    ex, ey = tx(0, max_r)
    L(f'<line x1="{sx}" y1="{sy}" x2="{ex}" y2="{ey}" stroke="#484f58" stroke-width="1"/>')

    # Pivot
    px, py = tx(0, 0)
    L(f'<circle cx="{px}" cy="{py}" r="{params.pivot_radius * scale}" fill="#f0883e" stroke="#ffa657" stroke-width="2"/>')
    L(f'<circle cx="{px}" cy="{py}" r="3" fill="#fff"/>')

    # Cam profile curve
    path_d = ""
    for i, (x, y, _, _, _) in enumerate(points):
        sx, sy = tx(x, y)
        if i == 0:
            path_d = f'M {sx:.1f} {sy:.1f}'
        else:
            path_d += f' L {sx:.1f} {sy:.1f}'
    L(f'<path d="{path_d}" fill="none" stroke="#58a6ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>')

    # MA indicator: thickness of stroke = log(MA)
    path_ma = ""
    for i, (x, y, _, _, ma) in enumerate(points):
        sx, sy = tx(x, y)
        if i == 0:
            path_ma = f'M {sx:.1f} {sy:.1f}'
        else:
            path_ma += f' L {sx:.1f} {sy:.1f}'
    sw = 1.5 + math.log2(max(params.ma_max, 1.5)) * 2
    L(f'<path d="{path_ma}" fill="none" stroke="#3fb950" stroke-width="{sw:.1f}" '
      f'stroke-opacity="0.25" stroke-linecap="round" stroke-linejoin="round"/>')

    # Force direction arrows along the cam
    force_rad = math.radians(params.force_angle_deg)
    arrow_step = max(1, len(points) // 12)
    for i in range(0, len(points), arrow_step):
        x, y, theta_deg, _, ma = points[i]
        theta_rad = math.radians(theta_deg)
        sx, sy = tx(x, y)
        # Force is applied in force_angle_deg direction
        arrow_len = 18 + ma * 6
        ex_a = sx + arrow_len * math.cos(force_rad)
        ey_a = sy - arrow_len * math.sin(force_rad)
        opacity = 0.3 + 0.7 * (ma / params.ma_max)
        L(f'<line x1="{sx}" y1="{sy}" x2="{ex_a:.1f}" y2="{ey_a:.1f}" '
          f'stroke="#f0883e" stroke-width="1.5" opacity="{opacity:.2f}" '
          f'marker-end="url(#arrowhead)"/>')

    # Arrowhead marker
    L('<defs>')
    L('<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">')
    L('<polygon points="0 0, 8 3, 0 6" fill="#f0883e"/>')
    L('</marker>')
    L('<marker id="arrowhead-start" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto">')
    L('<polygon points="8 0, 0 3, 8 6" fill="#3fb950"/>')
    L('</marker>')
    L('</defs>')

    # Stroke range labels
    start_x, start_y = tx(points[0][0], points[0][1])
    end_x, end_y = tx(points[-1][0], points[-1][1])
    L(f'<circle cx="{start_x:.1f}" cy="{start_y:.1f}" r="4" fill="#3fb950"/>')
    L(f'<text x="{start_x + 8:.1f}" y="{start_y - 6:.1f}" fill="#3fb950" font-size="10">'
      f'{params.stroke_start_deg}° (MA={points[0][4]:.1f})</text>')
    L(f'<circle cx="{end_x:.1f}" cy="{end_y:.1f}" r="4" fill="#f0883e"/>')
    L(f'<text x="{end_x + 8:.1f}" y="{end_y - 6:.1f}" fill="#f0883e" font-size="10">'
      f'{params.stroke_end_deg}° (MA={points[-1][4]:.1f})</text>')

    # Force direction label
    flx, fly = tx(max_r * 0.7 * math.cos(force_rad), max_r * 0.7 * math.sin(force_rad))
    L(f'<text x="{flx:.1f}" y="{fly:.1f}" fill="#f0883e" font-size="11" text-anchor="middle">F⃗ (input force direction)</text>')

    # Title
    L(f'<text x="10" y="20" fill="#c9d1d9" font-size="13" font-weight="bold">'
      f'Variable-MA Cam Profile | {params.ma_profile.title()} MA: {params.ma_min:.1f}→{params.ma_max:.1f}</text>')
    L(f'<text x="10" y="36" fill="#8b949e" font-size="10">'
      f'Stroke: {params.stroke_start_deg}°–{params.stroke_end_deg}° | Force direction: {params.force_angle_deg}°</text>')

    L('</svg>')

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"SVG written: {output_path}")
    return output_path


# ═══════════════════════════════════════════════════════════════
# MA GRAPH (standalone SVG)
# ═══════════════════════════════════════════════════════════════
def render_ma_graph(params: CamParams, ma_curve, output_path: str):
    """Generate a small MA(θ) graph as SVG."""
    w, h = 400, 220
    pad = 40
    lines = []
    def L(s):
        lines.append(s)

    L(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="monospace">')
    L('<rect width="100%" height="100%" fill="#0d1117"/>')

    max_ma = max(m[1] for m in ma_curve) * 1.15
    thetas = [m[0] for m in ma_curve]
    mas = [m[1] for m in ma_curve]

    def gx(theta):
        return pad + (theta - params.stroke_start_deg) / (params.stroke_end_deg - params.stroke_start_deg) * (w - 2 * pad)
    def gy(ma):
        return h - pad - ma / max_ma * (h - 2 * pad)

    # Axes
    L(f'<line x1="{pad}" y1="{h-pad}" x2="{w-pad}" y2="{h-pad}" stroke="#484f58" stroke-width="1"/>')
    L(f'<line x1="{pad}" y1="{pad}" x2="{pad}" y2="{h-pad}" stroke="#484f58" stroke-width="1"/>')

    # Curve
    path = ""
    for i, (theta, ma) in enumerate(ma_curve):
        x, y = gx(theta), gy(ma)
        if i == 0:
            path = f'M {x:.1f} {y:.1f}'
        else:
            path += f' L {x:.1f} {y:.1f}'
    L(f'<path d="{path}" fill="none" stroke="#58a6ff" stroke-width="2"/>')

    # Fill under curve
    path_fill = path + f' L {gx(ma_curve[-1][0]):.1f} {gy(0):.1f} L {gx(ma_curve[0][0]):.1f} {gy(0):.1f} Z'
    L(f'<path d="{path_fill}" fill="#58a6ff" opacity="0.12"/>')

    # Labels
    L(f'<text x="{w/2:.0f}" y="{h-6}" fill="#8b949e" font-size="9" text-anchor="middle">Rotation angle (°)</text>')
    L(f'<text x="12" y="{h/2:.0f}" fill="#8b949e" font-size="9" text-anchor="middle" '
      f'transform="rotate(-90, 12, {h/2:.0f})">Mechanical Advantage</text>')

    for v in [params.ma_min, params.ma_max, (params.ma_min + params.ma_max) / 2]:
        y = gy(v)
        L(f'<line x1="{pad-3}" y1="{y:.1f}" x2="{pad}" y2="{y:.1f}" stroke="#484f58" stroke-width="0.5"/>')
        L(f'<text x="{pad-5}" y="{y+3:.1f}" fill="#8b949e" font-size="8" text-anchor="end">{v:.1f}</text>')

    for deg in range(int(params.stroke_start_deg), int(params.stroke_end_deg) + 1, 15):
        x = gx(deg)
        L(f'<line x1="{x:.1f}" y1="{h-pad}" x2="{x:.1f}" y2="{h-pad+3}" stroke="#484f58" stroke-width="0.5"/>')
        L(f'<text x="{x:.1f}" y="{h-pad+14}" fill="#8b949e" font-size="8" text-anchor="middle">{deg}°</text>')

    L('</svg>')

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"MA graph: {output_path}")


# ═══════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════
def main():
    import argparse
    parser = argparse.ArgumentParser(description="Variable-MA Cam Profile Generator")
    parser.add_argument("--profile", default="linear",
                        choices=["linear", "quadratic", "exponential", "constant"],
                        help="MA profile shape")
    parser.add_argument("--ma-min", type=float, default=1.0, help="MA at stroke start")
    parser.add_argument("--ma-max", type=float, default=3.0, help="MA at stroke end")
    parser.add_argument("--stroke-start", type=float, default=20, help="Stroke start angle (degrees)")
    parser.add_argument("--stroke-end", type=float, default=80, help="Stroke end angle (degrees)")
    parser.add_argument("--force-angle", type=float, default=0, help="Input force direction (degrees, 0=horizontal)")
    parser.add_argument("--out", default="cam_profile.svg", help="Output SVG path")
    parser.add_argument("--graph-out", default="ma_graph.svg", help="MA graph output path")

    args = parser.parse_args()

    params = CamParams(
        force_angle_deg=args.force_angle,
        stroke_start_deg=args.stroke_start,
        stroke_end_deg=args.stroke_end,
        ma_min=args.ma_min,
        ma_max=args.ma_max,
        ma_profile=args.profile,
    )

    points, ma_curve = compute_cam(params)

    cam_svg = render_svg(params, points, ma_curve, args.out)
    render_ma_graph(params, ma_curve, args.graph_out)

    print(f"\nDone. Open {args.out} in browser to view.")
    print(f"Cam points: {len(points)} | Stroke: {params.stroke_start_deg}°→{params.stroke_end_deg}°")
    print(f"MA range: {params.ma_min:.2f}→{params.ma_max:.2f} ({params.ma_profile})")

    return cam_svg


if __name__ == "__main__":
    main()
