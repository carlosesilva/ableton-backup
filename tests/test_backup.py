"""Tests for backup logic."""

import json
import os
import zipfile
import pytest
from ableton_backup.backup import (
    find_projects,
    backup_project,
    run_backup,
    METADATA_FILENAME,
)


def _make_project(base_dir, name, als_files=None):
    """Helper: create a fake Ableton project directory."""
    project_dir = os.path.join(base_dir, name)
    os.makedirs(project_dir, exist_ok=True)
    als_files = als_files or [f"{name}.als"]
    for als in als_files:
        path = os.path.join(project_dir, als)
        with open(path, "w") as f:
            f.write("fake als content")
    # Add a sample audio file
    with open(os.path.join(project_dir, "sample.wav"), "w") as f:
        f.write("fake wav")
    return project_dir


class TestFindProjects:
    def test_finds_project_directories(self, tmp_path):
        projects_dir = tmp_path / "projects"
        projects_dir.mkdir()
        _make_project(str(projects_dir), "MySong")
        _make_project(str(projects_dir), "AnotherSong")
        found = find_projects(str(projects_dir))
        names = [os.path.basename(p) for p in found]
        assert "MySong" in names
        assert "AnotherSong" in names

    def test_ignores_non_project_directories(self, tmp_path):
        projects_dir = tmp_path / "projects"
        projects_dir.mkdir()
        # directory without .als file
        (projects_dir / "NotAProject").mkdir()
        found = find_projects(str(projects_dir))
        assert found == []

    def test_returns_empty_for_missing_path(self, tmp_path):
        found = find_projects(str(tmp_path / "nonexistent"))
        assert found == []

    def test_returns_single_result_for_valid_projects_path(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HOME", str(tmp_path))
        projects_dir = tmp_path / "projects"
        projects_dir.mkdir()
        _make_project(str(projects_dir), "TildeProject")
        found = find_projects(str(projects_dir))
        assert len(found) == 1


class TestBackupProject:
    def test_creates_zip_file(self, tmp_path):
        project_dir = _make_project(str(tmp_path / "projects"), "MySong")
        dest = str(tmp_path / "backups")
        entry = backup_project(project_dir, dest, timestamp="20240101T000000Z")
        assert os.path.exists(entry["backup_path"])
        assert entry["backup_path"].endswith(".zip")

    def test_zip_contains_project_files(self, tmp_path):
        project_dir = _make_project(str(tmp_path / "projects"), "MySong")
        dest = str(tmp_path / "backups")
        entry = backup_project(project_dir, dest, timestamp="20240101T000000Z")
        with zipfile.ZipFile(entry["backup_path"]) as zf:
            names = zf.namelist()
        assert any("MySong.als" in n for n in names)
        assert any("sample.wav" in n for n in names)

    def test_metadata_entry_has_required_fields(self, tmp_path):
        project_dir = _make_project(str(tmp_path / "projects"), "MySong")
        dest = str(tmp_path / "backups")
        entry = backup_project(project_dir, dest, timestamp="20240101T000000Z")
        assert entry["project"] == "MySong"
        assert entry["timestamp"] == "20240101T000000Z"
        assert entry["size_bytes"] > 0
        assert entry["source_path"] == project_dir

    def test_uses_utc_timestamp_when_none_given(self, tmp_path):
        project_dir = _make_project(str(tmp_path / "projects"), "MySong")
        dest = str(tmp_path / "backups")
        entry = backup_project(project_dir, dest)
        assert "T" in entry["timestamp"]
        assert entry["timestamp"].endswith("Z")


class TestRunBackup:
    def test_backs_up_all_projects(self, tmp_path):
        projects_dir = tmp_path / "projects"
        projects_dir.mkdir()
        _make_project(str(projects_dir), "Song1")
        _make_project(str(projects_dir), "Song2")
        dest = str(tmp_path / "backups")
        results = run_backup(str(projects_dir), dest)
        assert len(results) == 2
        names = {r["project"] for r in results}
        assert names == {"Song1", "Song2"}

    def test_returns_empty_list_for_no_projects(self, tmp_path):
        projects_dir = tmp_path / "projects"
        projects_dir.mkdir()
        dest = str(tmp_path / "backups")
        results = run_backup(str(projects_dir), dest)
        assert results == []

    def test_saves_metadata_file(self, tmp_path):
        projects_dir = tmp_path / "projects"
        projects_dir.mkdir()
        _make_project(str(projects_dir), "Song1")
        dest = str(tmp_path / "backups")
        run_backup(str(projects_dir), dest)
        metadata_path = os.path.join(dest, METADATA_FILENAME)
        assert os.path.exists(metadata_path)
        with open(metadata_path) as f:
            data = json.load(f)
        assert len(data) == 1
        assert data[0]["project"] == "Song1"

    def test_metadata_appends_across_runs(self, tmp_path):
        projects_dir = tmp_path / "projects"
        projects_dir.mkdir()
        _make_project(str(projects_dir), "Song1")
        dest = str(tmp_path / "backups")
        run_backup(str(projects_dir), dest)
        run_backup(str(projects_dir), dest)
        metadata_path = os.path.join(dest, METADATA_FILENAME)
        with open(metadata_path) as f:
            data = json.load(f)
        assert len(data) == 2
