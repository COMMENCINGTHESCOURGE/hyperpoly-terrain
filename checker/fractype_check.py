#!/usr/bin/env python3
"""
FracType Auto-Check — hardened.
- Fixes quote-nesting false-positive (mixed "it's/ok" no longer flagged)
- Keeps practical 5 bracket/quote containers
- Adds opt-in token-level scan for /* */ and <!-- -->
- Tier budget / overflow detection retained
"""
import sys
import re
from collections import Counter


def check_balance(response: str, scan_comments: bool = False) -> dict:
    """
    Validate container balance on response text.
    scan_comments=True enables token-level /* */ and <!-- --> detection.
    """
    # ── char-level: () {} [] (asymmetric brackets) ──
    bracket_pairs = {"(": ")", "{": "}", "[": "]"}
    stack = []

    # ── state flags: "" '' (symmetric quotes — need toggle, not stack) ──
    in_double = False
    in_single = False

    # ── token-level (optional) ──
    comment_open = False       # inside /* ... */
    markup_open = False        # inside <!-- ... -->
    pos = 0

    while pos < len(response):
        ch = response[pos]

        # handle escape sequences
        if ch == "\\" and pos + 1 < len(response):
            pos += 2
            continue

        if in_double:
            if ch == '"':
                in_double = False
            pos += 1
            continue

        if in_single:
            if ch == "'":
                in_single = False
            pos += 1
            continue

        # asymmetric brackets
        if ch in bracket_pairs:
            stack.append(bracket_pairs[ch])
            pos += 1
            continue

        if stack and ch == stack[-1]:
            stack.pop()
            pos += 1
            continue

        # symmetric quotes (only when not inside other quote/bracket)
        if ch == '"':
            in_double = True
            pos += 1
            continue
        if ch == "'":
            in_single = True
            pos += 1
            continue

        # token-level comment/markup scan (optional)
        if scan_comments:
            if response.startswith("/*", pos) and not comment_open:
                comment_open = True
                pos += 2
                continue
            if response.startswith("*/", pos) and comment_open:
                comment_open = False
                pos += 2
                continue
            if response.startswith("<!--", pos) and not markup_open:
                markup_open = True
                pos += 4
                continue
            if response.startswith("-->", pos) and markup_open:
                markup_open = False
                pos += 3
                continue

        pos += 1

    # ── verdict construction ──
    balanced = len(stack) == 0 and not in_double and not in_single
    if scan_comments:
        balanced = balanced and not comment_open and not markup_open

    unclosed = []
    if stack:
        unclosed.extend(reversed(stack))
    if in_double:
        unclosed.append('"')
    if in_single:
        unclosed.append("'")
    if scan_comments and comment_open:
        unclosed.append("*/")
    if scan_comments and markup_open:
        unclosed.append("-->")

    has_vinculum = "/" in response

    if balanced and has_vinculum:
        verdict = "BALANCED"
    elif balanced and not has_vinculum:
        verdict = "UNBALANCED (missing vinculum)"
    else:
        verdict = f"UNBALANCED (unclosed: {unclosed})"

    # ── tier budget ──
    lines = response.strip().split("\n")
    tier_map = {}
    for i, line in enumerate(lines):
        ln = len(line)
        if ln > 72:
            tier_map[i] = "OVERFLOW"
        elif ln > 48:
            tier_map[i] = "TIER_0"
        elif ln > 24:
            tier_map[i] = "TIER_1"
        else:
            tier_map[i] = "TIER_2"

    return {
        "balanced": balanced,
        "unclosed": unclosed,
        "has_vinculum": has_vinculum,
        "tier_distribution": dict(Counter(tier_map.values())),
        "overflow_lines": [i for i, t in tier_map.items() if t == "OVERFLOW"],
        "verdict": verdict,
        "container_types_checked": 5 + (2 if scan_comments else 0),
    }


if __name__ == "__main__":
    text = sys.stdin.read()
    scan = "--scan-comments" in sys.argv
    result = check_balance(text, scan_comments=scan)

    print(f"Verdict: {result['verdict']}")
    print(f"Containers checked: {result['container_types_checked']}")
    if result["unclosed"]:
        print(f"Unclosed: {result['unclosed']}")
    if result["overflow_lines"]:
        print(f"Overflow lines: {result['overflow_lines']}")
    if result["tier_distribution"]:
        print(f"Tiers: {result['tier_distribution']}")
