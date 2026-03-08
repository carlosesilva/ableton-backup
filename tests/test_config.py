"""Tests for configuration management."""

import os
import pytest
import yaml
from ableton_backup.config import (
    DEFAULT_CONFIG,
    load_config,
    save_config,
)


def test_load_config_defaults_when_missing(tmp_path):
    """load_config returns defaults when the config file does not exist."""
    config_path = str(tmp_path / "config.yaml")
    config = load_config(config_path)
    assert config == DEFAULT_CONFIG


def test_save_and_load_config(tmp_path):
    """Saved config can be loaded back correctly."""
    config_path = str(tmp_path / "config.yaml")
    data = {
        "ableton_path": "/Applications/Ableton Live.app",
        "projects_path": "/Users/demo/Music/Ableton",
        "destination_path": "/Users/demo/Backups",
        "cron_frequency": "0 * * * *",
        "enabled": True,
    }
    save_config(data, config_path)
    loaded = load_config(config_path)
    assert loaded == data


def test_save_config_creates_directory(tmp_path):
    """save_config creates intermediate directories if they do not exist."""
    config_path = str(tmp_path / "nested" / "dir" / "config.yaml")
    save_config({"enabled": False}, config_path)
    assert os.path.exists(config_path)


def test_load_config_merges_with_defaults(tmp_path):
    """Partial config is merged with defaults for missing keys."""
    config_path = str(tmp_path / "config.yaml")
    with open(config_path, "w") as f:
        yaml.dump({"projects_path": "/my/projects"}, f)
    config = load_config(config_path)
    assert config["projects_path"] == "/my/projects"
    assert config["enabled"] == DEFAULT_CONFIG["enabled"]
    assert config["cron_frequency"] == DEFAULT_CONFIG["cron_frequency"]


def test_load_config_handles_empty_file(tmp_path):
    """load_config returns defaults for an empty YAML file."""
    config_path = str(tmp_path / "config.yaml")
    (tmp_path / "config.yaml").write_text("")
    config = load_config(config_path)
    assert config == DEFAULT_CONFIG
