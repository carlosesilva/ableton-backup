# ableton-backup

Backups for Ableton without affecting performance

`ableton-backup` is a command-line tool that automatically backs up your
[Ableton Live](https://www.ableton.com/) projects to a configurable destination.
Each backup is a timestamped ZIP archive stored per-project. A JSON metadata log
is maintained so you can always trace exactly what was backed up and when.

---

## Features

- **Simple CLI** — configure, run, enable, disable, and check status with a single command.
- **Zip compression** — every backup is a self-contained `.zip` archive.
- **Metadata log** — a `backup_metadata.json` file is maintained in the destination folder.
- **Automated scheduling** — installs a cron entry so backups run on your chosen schedule.
- **macOS & Linux compatible** — works wherever Python 3.8+ and `crontab` are available.

---

## Installation

```bash
pip install ableton-backup
```

Or install from source:

```bash
git clone https://github.com/carlosesilva/ableton-backup.git
cd ableton-backup
pip install .
```

---

## Usage

### Configure

Run the interactive setup wizard:

```bash
ableton-backup configure
```

Or supply values directly via options:

```bash
ableton-backup configure \
  --ableton-path "/Applications/Ableton Live 11 Suite.app" \
  --projects-path "~/Music/Ableton" \
  --destination-path "~/Backups/Ableton" \
  --cron-frequency "0 * * * *"
```

Configuration is stored in `~/.ableton-backup/config.yaml`.

### Run a backup now

```bash
ableton-backup backup
```

### Enable automatic backups (via cron)

```bash
ableton-backup enable
```

This installs a cron entry using the frequency you configured (default: every hour).

### Disable automatic backups

```bash
ableton-backup disable
```

### Check status

```bash
ableton-backup status
```

---

## Configuration options

| Option             | Description                                              | Default        |
|--------------------|----------------------------------------------------------|----------------|
| `ableton_path`     | Path to the Ableton Live application                     | *(empty)*      |
| `projects_path`    | Path to your Ableton Live projects folder                | *(empty)*      |
| `destination_path` | Destination path where backups are stored                | *(empty)*      |
| `cron_frequency`   | Cron expression for automatic backup schedule            | `0 * * * *`    |
| `enabled`          | Whether automatic backups are currently enabled          | `false`        |

---

## Backup structure

```
~/Backups/Ableton/
├── backup_metadata.json          ← global metadata log
├── MySong/
│   ├── MySong_20240101T120000Z.zip
│   └── MySong_20240102T120000Z.zip
└── AnotherTrack/
    └── AnotherTrack_20240101T120000Z.zip
```

---

## Development

```bash
pip install -r requirements-dev.txt
pytest
```
