"""Command-line interface for ableton-backup."""

import sys
import click
from . import __version__
from .config import load_config, save_config, get_config_path
from .backup import run_backup
from .scheduler import (
    install_cron,
    remove_cron,
    cron_is_installed,
    validate_cron_frequency,
)


@click.group()
@click.version_option(version=__version__, prog_name="ableton-backup")
def cli():
    """Ableton Live project backup tool.

    Automatically backs up your Ableton Live projects to a chosen destination.
    """


@cli.command()
@click.option("--ableton-path", default=None, help="Path to the Ableton Live application.")
@click.option("--projects-path", default=None, help="Path to your Ableton Live projects folder.")
@click.option("--destination-path", default=None, help="Destination path for backups.")
@click.option(
    "--cron-frequency",
    default=None,
    help='Cron frequency expression (e.g. "0 * * * *" for hourly).',
)
def configure(ableton_path, projects_path, destination_path, cron_frequency):
    """Configure ableton-backup settings.

    If no options are provided, an interactive prompt is displayed for each
    setting.
    """
    config = load_config()
    interactive = not any([ableton_path, projects_path, destination_path, cron_frequency])

    if interactive:
        click.echo("Configure ableton-backup (press Enter to keep current value):\n")

        ableton_path = click.prompt(
            "Ableton Live application path",
            default=config.get("ableton_path") or "",
        )
        projects_path = click.prompt(
            "Ableton Live projects folder",
            default=config.get("projects_path") or "",
        )
        destination_path = click.prompt(
            "Backup destination path",
            default=config.get("destination_path") or "",
        )
        cron_frequency = click.prompt(
            "Cron frequency (e.g. '0 * * * *' for hourly)",
            default=config.get("cron_frequency") or "0 * * * *",
        )

    if ableton_path is not None:
        config["ableton_path"] = ableton_path
    if projects_path is not None:
        config["projects_path"] = projects_path
    if destination_path is not None:
        config["destination_path"] = destination_path
    if cron_frequency is not None:
        if not validate_cron_frequency(cron_frequency):
            click.echo(
                f"Error: '{cron_frequency}' is not a valid 5-field cron expression.",
                err=True,
            )
            sys.exit(1)
        config["cron_frequency"] = cron_frequency

    save_config(config)
    click.echo(f"\nConfiguration saved to {get_config_path()}")


@cli.command()
def backup():
    """Run a backup of all Ableton Live projects now."""
    config = load_config()
    projects_path = config.get("projects_path", "")
    destination_path = config.get("destination_path", "")

    if not projects_path:
        click.echo(
            "Error: projects_path is not configured. Run 'ableton-backup configure' first.",
            err=True,
        )
        sys.exit(1)
    if not destination_path:
        click.echo(
            "Error: destination_path is not configured. Run 'ableton-backup configure' first.",
            err=True,
        )
        sys.exit(1)

    click.echo(f"Backing up projects from: {projects_path}")
    click.echo(f"Destination: {destination_path}\n")

    results = run_backup(projects_path, destination_path)

    if not results:
        click.echo("No Ableton projects found in the configured projects folder.")
    else:
        for entry in results:
            size_kb = entry["size_bytes"] / 1024
            click.echo(f"  ✓ {entry['project']}  →  {entry['backup_path']}  ({size_kb:.1f} KB)")
        click.echo(f"\nBacked up {len(results)} project(s).")


@cli.command()
def enable():
    """Enable automatic backups via cron."""
    config = load_config()
    projects_path = config.get("projects_path", "")
    destination_path = config.get("destination_path", "")
    cron_frequency = config.get("cron_frequency", "0 * * * *")

    if not projects_path or not destination_path:
        click.echo(
            "Error: projects_path and destination_path must be configured before enabling "
            "automatic backups. Run 'ableton-backup configure' first.",
            err=True,
        )
        sys.exit(1)

    if not validate_cron_frequency(cron_frequency):
        click.echo(
            f"Error: stored cron frequency '{cron_frequency}' is invalid. "
            "Run 'ableton-backup configure' to fix it.",
            err=True,
        )
        sys.exit(1)

    install_cron(cron_frequency)
    config["enabled"] = True
    save_config(config)
    click.echo(f"Automatic backups enabled (schedule: {cron_frequency}).")


@cli.command()
def disable():
    """Disable automatic backups (removes the cron entry)."""
    remove_cron()
    config = load_config()
    config["enabled"] = False
    save_config(config)
    click.echo("Automatic backups disabled.")


@cli.command()
def status():
    """Show current configuration and backup status."""
    config = load_config()
    config_path = get_config_path()
    active = cron_is_installed()

    click.echo(f"Config file     : {config_path}")
    click.echo(f"Ableton path    : {config.get('ableton_path') or '(not set)'}")
    click.echo(f"Projects path   : {config.get('projects_path') or '(not set)'}")
    click.echo(f"Destination path: {config.get('destination_path') or '(not set)'}")
    click.echo(f"Cron frequency  : {config.get('cron_frequency') or '(not set)'}")
    click.echo(f"Enabled (config): {config.get('enabled', False)}")
    click.echo(f"Cron installed  : {active}")


def main():
    cli()


if __name__ == "__main__":
    main()
