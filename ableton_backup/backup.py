"""Backup logic for ableton-backup."""

import json
import os
import zipfile
from datetime import datetime, timezone
from typing import List, Optional


METADATA_FILENAME = "backup_metadata.json"


def find_projects(projects_path: str) -> List[str]:
    """Return a list of Ableton project directory paths found in *projects_path*.

    An Ableton project directory contains at least one ``.als`` file.
    """
    projects_path = os.path.expanduser(projects_path)
    project_dirs = []
    if not os.path.isdir(projects_path):
        return project_dirs
    for entry in os.scandir(projects_path):
        if not entry.is_dir():
            continue
        for sub in os.scandir(entry.path):
            if sub.is_file() and sub.name.endswith(".als"):
                project_dirs.append(entry.path)
                break
    return sorted(project_dirs)


def backup_project(
    project_path: str,
    destination_path: str,
    timestamp: Optional[str] = None,
) -> dict:
    """Zip a single project directory into *destination_path*.

    Returns a metadata dict describing the backup.
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    project_name = os.path.basename(project_path)
    zip_name = f"{project_name}_{timestamp}.zip"
    dest_dir = os.path.join(os.path.expanduser(destination_path), project_name)
    os.makedirs(dest_dir, exist_ok=True)
    zip_path = os.path.join(dest_dir, zip_name)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _dirs, files in os.walk(project_path):
            for filename in files:
                file_path = os.path.join(root, filename)
                arcname = os.path.relpath(file_path, start=os.path.dirname(project_path))
                zf.write(file_path, arcname)

    zip_size = os.path.getsize(zip_path)
    metadata_entry = {
        "project": project_name,
        "source_path": project_path,
        "backup_path": zip_path,
        "timestamp": timestamp,
        "size_bytes": zip_size,
    }
    return metadata_entry


def run_backup(projects_path: str, destination_path: str) -> List[dict]:
    """Back up all Ableton projects found in *projects_path*.

    Returns a list of metadata dicts, one per backed-up project.
    """
    projects_path = os.path.expanduser(projects_path)
    destination_path = os.path.expanduser(destination_path)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    projects = find_projects(projects_path)
    results = []
    for project in projects:
        entry = backup_project(project, destination_path, timestamp=timestamp)
        results.append(entry)
    _save_metadata(destination_path, results)
    return results


def _save_metadata(destination_path: str, entries: List[dict]) -> None:
    """Append *entries* to the global metadata log in *destination_path*."""
    os.makedirs(destination_path, exist_ok=True)
    metadata_path = os.path.join(destination_path, METADATA_FILENAME)
    existing: List[dict] = []
    if os.path.exists(metadata_path):
        with open(metadata_path, "r") as f:
            try:
                existing = json.load(f)
            except json.JSONDecodeError:
                existing = []
    existing.extend(entries)
    with open(metadata_path, "w") as f:
        json.dump(existing, f, indent=2)
