"""Cron scheduler integration for ableton-backup.

Uses the system ``crontab`` command (available on macOS and Linux) to install
or remove a cron entry that runs ``ableton-backup backup`` automatically.
"""

import re
import shutil
import subprocess
import sys
from typing import Optional


CRON_COMMENT = "# ableton-backup"


def _crontab_read() -> str:
    """Return the current user crontab as a string (empty string if none)."""
    result = subprocess.run(
        ["crontab", "-l"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        # No crontab exists yet
        return ""
    return result.stdout


def _crontab_write(content: str) -> None:
    """Replace the user crontab with *content*."""
    proc = subprocess.run(
        ["crontab", "-"],
        input=content,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Failed to write crontab: {proc.stderr.strip()}")


def _backup_command() -> str:
    """Return the shell command used to invoke the backup."""
    executable = shutil.which("ableton-backup") or f"{sys.executable} -m ableton_backup"
    return f"{executable} backup"


def install_cron(frequency: str) -> None:
    """Install (or update) the cron entry with the given *frequency* expression."""
    crontab = _crontab_read()
    lines = [l for l in crontab.splitlines() if CRON_COMMENT not in l]
    cmd = _backup_command()
    lines.append(f"{frequency} {cmd} {CRON_COMMENT}")
    _crontab_write("\n".join(lines) + "\n")


def remove_cron() -> None:
    """Remove the ableton-backup cron entry if present."""
    crontab = _crontab_read()
    lines = [l for l in crontab.splitlines() if CRON_COMMENT not in l]
    _crontab_write("\n".join(lines) + "\n")


def cron_is_installed() -> bool:
    """Return True if an ableton-backup cron entry is present."""
    return CRON_COMMENT in _crontab_read()


def validate_cron_frequency(frequency: str) -> bool:
    """Return True if *frequency* looks like a valid 5-field cron expression."""
    parts = frequency.strip().split()
    return len(parts) == 5
