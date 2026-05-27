#!/usr/bin/env python3
"""
FracType High-Density Curses Terminal Dashboard.
Hardened: resize guard, safe_addstr, decoupled TelemetrySource.
Press 't' to toggle compact vinculum table mode.
"""
import curses
import time
import random
import sys
import os

# bridge schema import (relative to dashboard/ sibling bridge/)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'bridge'))
from fractype_schema import FracNode, FracTable


# ── safe_addstr: prevents curses.error on OOB bottom-right writes ──
def safe_addstr(stdscr, y, x, text, attr=0):
    max_y, max_x = stdscr.getmaxyx()
    if y >= max_y or x >= max_x:
        return
    available = max_x - x
    stdscr.addstr(y, x, text[:available], attr)


# ── TelemetrySource: decoupled data layer (swap psutil / REST / /proc) ──
class TelemetrySource:
    def get_cpu(self):
        return {"load": random.randint(35, 92), "threads": 24}

    def get_memory(self):
        return {"used_gb": round(random.uniform(1.8, 3.9), 2), "limit_gb": 4.0}

    def get_network(self):
        return {"status": random.choice(["ONLINE", "ONLINE", "DEGRADED"]), "latency_ms": 14}

    def get_io(self):
        return {"throughput_mbs": round(random.uniform(100.0, 200.0), 1), "queue_empty": True}


# ── Dashboard renderer ──
class Dashboard:
    def __init__(self, source=None):
        self.source = source or TelemetrySource()
        self.compact = False

    def render(self, stdscr):
        cpu = self.source.get_cpu()
        mem = self.source.get_memory()
        net = self.source.get_network()
        io = self.source.get_io()

        cpu_color = 1 if cpu["load"] < 70 else (2 if cpu["load"] < 85 else 3)
        mem_color = 1 if mem["used_gb"] < 3.0 else 2
        net_color = 1 if net["status"] == "ONLINE" else 2

        safe_addstr(stdscr, 1, 2, "=== FRAC-TYPE CORE TELEMETRY LABS ===", curses.A_UNDERLINE)
        mode_hint = "COMPACT TABLE" if self.compact else "STANDARD"
        safe_addstr(stdscr, 2, 2, f"Press 'q' to quit | 't' to toggle [{mode_hint}]", curses.A_DIM)

        if self.compact:
            self._render_compact(stdscr, cpu, mem, net, io, cpu_color, mem_color, net_color)
        else:
            self._render_standard(stdscr, cpu, mem, net, io, cpu_color, mem_color, net_color)

    def _render_standard(self, stdscr, cpu, mem, net, io, cpu_color, mem_color, net_color):
        w1 = self._draw_cell(stdscr, y=4, x=2,
                             top=f"CPU: {cpu['load']}%",
                             bottom=f"THR: {cpu['threads']} active",
                             title="PROCESSOR_A", color_pair=cpu_color)

        self._draw_cell(stdscr, y=4, x=2 + w1 + 4,
                        top=f"MEM: {mem['used_gb']} GB",
                        bottom=f"LIMIT: {mem['limit_gb']} GB",
                        title="MEMORY_STACK", color_pair=mem_color)

        w2 = self._draw_cell(stdscr, y=9, x=2,
                             top=f"NET: {net['status']}",
                             bottom=f"LATENCY: {net['latency_ms']}ms",
                             title="NETWORK_LINK", color_pair=net_color)

        self._draw_cell(stdscr, y=9, x=2 + w2 + 4,
                        top=f"IO: {io['throughput_mbs']} MB/s",
                        bottom="QUEUE: 0 empty" if io["queue_empty"] else "QUEUE: BACKLOG",
                        title="DISK_BUFFER", color_pair=1)

    def _render_compact(self, stdscr, cpu, mem, net, io, cpu_color, mem_color, net_color):
        """Side-by-side vinculum table — all 4 telemetry sources in one compressed block."""
        nodes = [
            FracNode(top=f"CPU: {cpu['load']}%", bottom=f"THR: {cpu['threads']}"),
            FracNode(top=f"MEM: {mem['used_gb']} GB", bottom=f"LIMIT: {mem['limit_gb']} GB"),
            FracNode(top=f"NET: {net['status']}", bottom=f"LAT: {net['latency_ms']}ms"),
            FracNode(top=f"IO: {io['throughput_mbs']}", bottom="Q: 0" if io["queue_empty"] else "Q: BACK"),
        ]
        table = FracTable(nodes=nodes)
        self._draw_table(stdscr, 4, 2, table)

    def _draw_table(self, stdscr, y, x, table):
        """Render a FracTable as a side-by-side vinculum block."""
        lines = table.to_terminal_table()
        color_pairs = [1, 2, 3, 1]  # cycles through for each column
        sep = " │ "
        bar_attr = curses.A_DIM

        # render tops
        parts = lines[0].split(" │ ")
        cx = x
        for i, part in enumerate(parts):
            attr = curses.color_pair(1 + (i % 3)) | curses.A_BOLD
            safe_addstr(stdscr, y, cx, part, attr)
            cx += len(part)
            if i < len(parts) - 1:
                safe_addstr(stdscr, y, cx, sep, bar_attr)
                cx += len(sep)

        # render vinculum bars
        parts = lines[1].split(" │ ")
        cx = x
        for i, part in enumerate(parts):
            safe_addstr(stdscr, y + 1, cx, part, bar_attr)
            cx += len(part)
            if i < len(parts) - 1:
                safe_addstr(stdscr, y + 1, cx, sep, bar_attr)
                cx += len(sep)

        # render bottoms
        parts = lines[2].split(" │ ")
        cx = x
        for i, part in enumerate(parts):
            attr = curses.color_pair(1 + (i % 3))
            safe_addstr(stdscr, y + 2, cx, part, attr)
            cx += len(part)
            if i < len(parts) - 1:
                safe_addstr(stdscr, y + 2, cx, sep, bar_attr)
                cx += len(sep)

    def _draw_cell(self, stdscr, y, x, top, bottom, title="", color_pair=1):
        width = max(len(top), len(bottom), len(title)) + 2

        if title:
            safe_addstr(stdscr, y, x, f"[{title}]", curses.A_DIM)
            y_off = 1
        else:
            y_off = 0

        safe_addstr(stdscr, y + y_off, x, top.center(width), curses.color_pair(color_pair) | curses.A_BOLD)
        safe_addstr(stdscr, y + y_off + 1, x, "─" * width, curses.A_NORMAL)
        safe_addstr(stdscr, y + y_off + 2, x, bottom.center(width), curses.color_pair(color_pair))
        return width


# ── main loop with SIGWINCH resilience ──
def main(stdscr):
    curses.curs_set(0)
    stdscr.nodelay(True)

    curses.start_color()
    curses.init_pair(1, curses.COLOR_GREEN, curses.COLOR_BLACK)
    curses.init_pair(2, curses.COLOR_YELLOW, curses.COLOR_BLACK)
    curses.init_pair(3, curses.COLOR_RED, curses.COLOR_BLACK)

    dashboard = Dashboard()

    while True:
        stdscr.erase()
        max_y, max_x = stdscr.getmaxyx()

        if max_y < 14 or max_x < 40:
            safe_addstr(stdscr, 0, 0, "TERMINAL TOO SMALL — Resize to continue")
            stdscr.refresh()
            time.sleep(0.5)
            continue

        dashboard.render(stdscr)
        stdscr.refresh()

        key = stdscr.getch()
        if key == curses.KEY_RESIZE:
            stdscr.clear()
            continue
        if key in (ord('q'), ord('Q')):
            break
        if key in (ord('t'), ord('T')):
            dashboard.compact = not dashboard.compact

        time.sleep(0.4)


if __name__ == "__main__":
    curses.wrapper(main)
