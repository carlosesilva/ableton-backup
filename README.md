# ableton-backup

Automatically backup Ableton Live projects on macOS without affecting performance.

Monitors your Live Projects folder for changes and zips any modified project to a configured destination on a cron schedule. Backups are skipped while Ableton Live is open.

## Requirements

- macOS
- [Node.js](https://nodejs.org/) v14 or later

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/carlosesilva/ableton-backup.git
cd ableton-backup
npm install
npm run build
npm link
```

`npm link` makes the `ableton-backup` command available globally in your terminal.

## Quick start

Run the interactive setup wizard to configure the tool:

```bash
ableton-backup setup
```

You will be prompted for:

| Setting | Description | Default |
|---|---|---|
| Ableton path | Path to the Ableton Live `.app` bundle | `/Applications/Ableton Live 12 Suite.app` |
| Projects path | Folder containing your Live Projects | `~/Documents/Ableton/Live Sets` |
| Destination path | Where backup zips will be saved | `~/Documents/Ableton/Live Sets Backups` |
| Node path | Node.js executable used by cron | `~/.local/share/mise/shims/node` |
| Cron frequency | How often to check for changes ([cron expression](https://crontab.guru/)) | `* * * * *` (every minute) |
| Computer name | Suffix added to backup zip filenames | Your macOS hostname |
| Debug mode | Sets `ABLETON_BACKUP_LOG_LEVEL=debug` for cron runs | No |
| Activate now | Install the cron job immediately | No |

Configuration is saved to `~/.ableton-backup/config.yaml`.

## Commands

```
ableton-backup setup          Run the interactive setup wizard
ableton-backup run            Run a backup cycle right now
ableton-backup run --dry-run  Show what would be backed up without creating zips
ableton-backup start          Enable automatic backups (installs cron job)
ableton-backup stop           Disable automatic backups (removes cron job)
ableton-backup status         Show current configuration and cron status
ableton-backup config         Show current configuration
ableton-backup config [opts]  Update individual settings (see below)
```

### `ableton-backup config` options

```
--ableton-path <path>       Set the Ableton Live application path
--projects-path <path>      Set the Live Projects folder path
--destination-path <path>   Set the backup destination path
--node-path <path>          Set Node.js binary path used by cron
--cron-frequency <expr>     Set the cron frequency expression
--computer-name <name>      Set the computer name added to zip filenames
--debug-mode <true|false>   Enable or disable debug mode for cron runs
--active <true|false>       Enable or disable automatic backups
```

Example – change the backup frequency to every 30 minutes and activate:

```bash
ableton-backup config --cron-frequency "*/30 * * * *" --active true
```

Preview which projects would be backed up without writing any files:

```bash
ableton-backup run --dry-run
```

## How it works

1. On each cron tick, the configured Node binary runs `dist/cli.js run` automatically.
2. Non-dry-run executions are throttled so only one backup cycle starts within a 10 minute window.
3. If Ableton Live is currently open, the run is skipped to avoid performance impact.
4. Every Live Project directory (a top-level folder containing a `.als` file) under the configured projects path is inspected.
5. A project is skipped when any of these rules apply:

   - no changes since its last successful backup
   - it was modified less than 30 minutes ago
   - it was already backed up earlier the same ET day
   - it was modified today and it is still before 11 PM ET

6. Projects that need backup are zipped to a temporary local file first, then moved to the configured destination.
7. Backup archives are named:

   ```
   <Project Name> (Backup YYYY-MM-DD_HH-MM-SS-mmm <Computer Name>).zip
   ```

Configuration is stored in `~/.ableton-backup/config.yaml`.
Backup metadata (timestamps of the last backup per project) is stored in `~/.ableton-backup/metadata.yaml`.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run CLI without building (via ts-node)
npm run dev -- <command>

# Run tests
npm test
```

## Logging and Debug Mode

Every run writes human-readable log lines to the terminal and to a daily log file at:

```text
~/.ableton-backup/logs/YYYY-MM-DD.log
```

Set `ABLETON_BACKUP_LOG_LEVEL=debug` to include debug details such as lock and throttle skip reasons:

```bash
ABLETON_BACKUP_LOG_LEVEL=debug ableton-backup run --dry-run
```

Valid values are `error`, `warn`, `info`, `http`, `verbose`, `debug`, and `silly`.
If unset (or invalid), the default is `info`.

Example run output:

```bash
2026-03-13 15:59:01 info: Starting backup cycle...
2026-03-13 15:59:01 info: Ableton is not running. Proceeding with backup.
2026-03-13 15:59:01 info: Found 3 project(s) in /Users/Shared/Ableton/Live Sets.
2026-03-13 15:59:01 info: Checking project: Hail to the King Project
2026-03-13 15:59:01 info:	Skipping: no changes since last backup.
2026-03-13 15:59:01 info: Checking project: Renegade Project
2026-03-13 15:59:01 info:	Backing up...
2026-03-13 15:59:01 info:	[                                        ] (0/356 files)
2026-03-13 15:59:11 info:	[===============>                        ] (140/356 files)
2026-03-13 15:59:21 info:	[=====================================>  ] (336/356 files)
2026-03-13 15:59:23 info:	Backed up to /Users/johndoe/Google Drive/My Drive/Ableton/Live Sets/Backups/Renegade Project/Renegade Project (Backup 2026-03-13_19-59-01-255 John-MacBook-Pro).zip
2026-03-13 15:59:23 info: Checking project: Despacito Project
2026-03-13 15:59:23 info:	Skipping: no changes since last backup.
2026-03-13 15:59:23 info: Backup complete. Backed up: 1, Skipped: 2.
```
