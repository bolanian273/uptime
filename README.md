# Uptime

A cross-platform, self-hosted uptime and network performance monitoring web application built with Node.js, Express, EJS, and SQLite (`node:sqlite`) / MySQL — customized from [codewizdevs/uptime](https://github.com/codewizdevs/uptime) by **BOLANIAN273**.

## Overview

This fork adapts the upstream monitoring platform for modern Node.js and native Windows environments while adding Ookla Speedtest throughput tracking and session-based access controls across status and management routes.

## Key Features & Differences from Upstream

- **Native Node.js 26 & SQLite Support:** Uses Node.js's built-in `node:sqlite` (`DatabaseSync`) driver for SQLite persistence so Windows installations run without `node-gyp` compilation of `better-sqlite3`.
- **Cross-Platform Ping & CLI Resolution:** Resolves platform-specific executables across Windows (`ping.exe`, `speedtest.exe`), macOS, and Linux/BSD.
- **Ookla Speedtest Monitor (`speedtest`):** Adds a `speedtest` monitor type powered by the official Ookla Speedtest CLI with optional server selection and minimum download/upload speed thresholds:
  - Persists `download_mbps` and `upload_mbps` alongside latency and check status.
  - Displays live download (`↓`) and upload (`↑`) speeds and ping on dashboard monitor cards.
  - Displays historic download and upload speeds in the monitor detail **Recent checks** table.
  - Displays daily average download and upload speeds in status page 90-day bar hover tooltips.
- **Session Authentication & Route Gating:** Enforces session authentication on `/status` (`GET /status`, `/status.json`, `/status.rss`), `/badge`, and application routes while keeping `/branding/*` accessible on `/login` and `/ping/*` open for heartbeat pings.
- **Role-Based Dashboard Controls & Attribution:** Hides the monitor creation button on the dashboard for `viewer` users alongside backend role checks, and includes `modified by BOLANIAN273` attribution in the footer and status page.

## Getting Started

### Prerequisites

- **Node.js 20+** (tested on **Node.js 26**)
- *(Optional)* **Ookla Speedtest CLI** if using `speedtest` monitors:
  - **Windows:** `winget install Ookla.Speedtest.CLI`
  - **macOS:** `brew install ookla-speedtest`
  - **Linux:** Install via [Ookla's official CLI guide](https://www.speedtest.net/apps/cli)

### Installation & Running

1. Clone the repository and open the project directory:

   ```bash
   git clone <your-repository-url>
   cd <your-repository-directory>
   ```

2. Copy `.env.example` to `.env` and configure `SESSION_SECRET`, `ADMIN_USER`, and `ADMIN_PASS`:

   ```bash
   cp .env.example .env
   ```

3. Install dependencies and start the server:

   ```bash
   npm install
   npm start
   ```

4. Open `http://localhost:3000` in your browser and sign in.

## Credits & License

- Original upstream project: [codewizdevs/uptime](https://github.com/codewizdevs/uptime) by **codewizdevs**
- Modifications: **BOLANIAN273**
- License: **MIT** (see [LICENSE](LICENSE))