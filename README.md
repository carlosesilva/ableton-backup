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
| Projects path | Folder containing your Live Projects | `~/Music/Ableton` |
| Destination path | Where backup zips will be saved | `~/Documents/Ableton Backups` |
| Node path | Node.js executable used by cron | `~/.local/share/mise/shims/node` |
| Cron frequency | How often to check for changes ([cron expression](https://crontab.guru/)) | `0 * * * *` (hourly) |
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
2. If Ableton Live is currently open, the run is skipped to avoid performance impact.
3. Every Live Project directory (a folder containing a `.als` file) under the configured projects path is inspected.
4. If a project has been modified since its last backup (or has never been backed up), it is zipped to the destination folder.
5. Backup archives are named:

   ```
   <Project Name> (Backup YYYY-MM-DD_HH-MM-SS-mmm).zip
   ```

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

## Debug Logging

Set `ABLETON_BACKUP_LOG_LEVEL=debug` to show debug logs (including lock/throttle skip reasons):

```bash
ABLETON_BACKUP_LOG_LEVEL=debug ableton-backup run --dry-run
```

Valid values are `error`, `warn`, `info`, `http`, `verbose`, `debug`, and `silly`.
If unset (or invalid), the default is `info`.
