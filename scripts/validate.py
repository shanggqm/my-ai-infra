#!/usr/bin/env python3
"""Compatibility entry point; Node.js owns the validation contract."""
from pathlib import Path
import subprocess

if __name__ == "__main__":
    raise SystemExit(subprocess.call(["node", str(Path(__file__).with_suffix(".mjs"))]))
