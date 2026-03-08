"""Configuration management for ableton-backup."""

import os
import yaml

DEFAULT_CONFIG_DIR = os.path.expanduser("~/.ableton-backup")
DEFAULT_CONFIG_PATH = os.path.join(DEFAULT_CONFIG_DIR, "config.yaml")

DEFAULT_CONFIG = {
    "ableton_path": "",
    "projects_path": "",
    "destination_path": "",
    "cron_frequency": "0 * * * *",
    "enabled": False,
}


def load_config(config_path: str = None) -> dict:
    """Load configuration from YAML file. Returns defaults if file does not exist."""
    if config_path is None:
        config_path = DEFAULT_CONFIG_PATH
    if not os.path.exists(config_path):
        return dict(DEFAULT_CONFIG)
    with open(config_path, "r") as f:
        data = yaml.safe_load(f) or {}
    config = dict(DEFAULT_CONFIG)
    config.update(data)
    return config


def save_config(config: dict, config_path: str = None) -> None:
    """Save configuration to YAML file, creating the directory if necessary."""
    if config_path is None:
        config_path = DEFAULT_CONFIG_PATH
    os.makedirs(os.path.dirname(config_path), exist_ok=True)
    with open(config_path, "w") as f:
        yaml.dump(config, f, default_flow_style=False)


def get_config_path() -> str:
    """Return the default configuration file path."""
    return DEFAULT_CONFIG_PATH
