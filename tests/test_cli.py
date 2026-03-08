"""Tests for the CLI commands."""

import os
import pytest
import yaml
from click.testing import CliRunner
from ableton_backup.cli import cli


@pytest.fixture()
def runner():
    return CliRunner()


@pytest.fixture()
def isolated(tmp_path, monkeypatch):
    """Patch DEFAULT_CONFIG_PATH to a temp location for each test."""
    config_path = str(tmp_path / "config.yaml")
    monkeypatch.setattr("ableton_backup.config.DEFAULT_CONFIG_PATH", config_path)
    return config_path


class TestVersion:
    def test_version_flag(self, runner):
        result = runner.invoke(cli, ["--version"])
        assert result.exit_code == 0
        assert "0.1.0" in result.output


class TestConfigureCommand:
    def test_configure_with_options(self, runner, isolated):
        result = runner.invoke(
            cli,
            [
                "configure",
                "--projects-path", "/my/projects",
                "--destination-path", "/my/backups",
                "--cron-frequency", "0 2 * * *",
            ],
        )
        assert result.exit_code == 0, result.output
        with open(isolated) as f:
            config = yaml.safe_load(f)
        assert config["projects_path"] == "/my/projects"
        assert config["destination_path"] == "/my/backups"
        assert config["cron_frequency"] == "0 2 * * *"

    def test_configure_rejects_invalid_cron(self, runner, isolated):
        result = runner.invoke(
            cli,
            ["configure", "--cron-frequency", "not-a-cron"],
        )
        assert result.exit_code != 0

    def test_configure_interactive(self, runner, isolated):
        inputs = "\n".join([
            "/Applications/Ableton.app",
            "/my/projects",
            "/my/backups",
            "0 * * * *",
        ]) + "\n"
        result = runner.invoke(cli, ["configure"], input=inputs)
        assert result.exit_code == 0, result.output
        with open(isolated) as f:
            config = yaml.safe_load(f)
        assert config["ableton_path"] == "/Applications/Ableton.app"
        assert config["projects_path"] == "/my/projects"


class TestBackupCommand:
    def _make_project(self, base_dir, name):
        project_dir = os.path.join(base_dir, name)
        os.makedirs(project_dir, exist_ok=True)
        with open(os.path.join(project_dir, f"{name}.als"), "w") as f:
            f.write("fake als")
        return project_dir

    def test_backup_requires_configured_paths(self, runner, isolated):
        result = runner.invoke(cli, ["backup"])
        assert result.exit_code != 0

    def test_backup_runs_successfully(self, runner, isolated, tmp_path):
        projects_dir = tmp_path / "projects"
        projects_dir.mkdir()
        self._make_project(str(projects_dir), "MySong")
        backups_dir = tmp_path / "backups"

        # Write config
        with open(isolated, "w") as f:
            yaml.dump(
                {
                    "projects_path": str(projects_dir),
                    "destination_path": str(backups_dir),
                    "enabled": False,
                    "cron_frequency": "0 * * * *",
                    "ableton_path": "",
                },
                f,
            )

        result = runner.invoke(cli, ["backup"])
        assert result.exit_code == 0, result.output
        assert "MySong" in result.output
        assert "Backed up 1 project" in result.output


class TestStatusCommand:
    def test_status_shows_config(self, runner, isolated, monkeypatch):
        # Patch cron_is_installed to avoid real crontab calls
        monkeypatch.setattr("ableton_backup.cli.cron_is_installed", lambda: False)
        with open(isolated, "w") as f:
            yaml.dump(
                {
                    "projects_path": "/my/projects",
                    "destination_path": "/my/backups",
                    "ableton_path": "/Applications/Ableton.app",
                    "cron_frequency": "0 * * * *",
                    "enabled": True,
                },
                f,
            )
        result = runner.invoke(cli, ["status"])
        assert result.exit_code == 0, result.output
        assert "/my/projects" in result.output
        assert "/my/backups" in result.output
        assert "0 * * * *" in result.output


class TestEnableCommand:
    def test_enable_requires_configured_paths(self, runner, isolated, monkeypatch):
        monkeypatch.setattr("ableton_backup.cli.install_cron", lambda freq: None)
        result = runner.invoke(cli, ["enable"])
        assert result.exit_code != 0

    def test_enable_installs_cron(self, runner, isolated, tmp_path, monkeypatch):
        installed = []
        monkeypatch.setattr("ableton_backup.cli.install_cron", lambda freq: installed.append(freq))
        with open(isolated, "w") as f:
            yaml.dump(
                {
                    "projects_path": "/my/projects",
                    "destination_path": "/my/backups",
                    "ableton_path": "",
                    "cron_frequency": "0 * * * *",
                    "enabled": False,
                },
                f,
            )
        result = runner.invoke(cli, ["enable"])
        assert result.exit_code == 0, result.output
        assert installed == ["0 * * * *"]


class TestDisableCommand:
    def test_disable_removes_cron(self, runner, isolated, monkeypatch):
        removed = []
        monkeypatch.setattr("ableton_backup.cli.remove_cron", lambda: removed.append(True))
        with open(isolated, "w") as f:
            yaml.dump({"enabled": True}, f)
        result = runner.invoke(cli, ["disable"])
        assert result.exit_code == 0, result.output
        assert removed == [True]
