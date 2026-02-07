# Rem Dashboard

A React-based dashboard interface for Rem, designed for 800x480 displays with fullscreen support.

## Features

- 🌸 Beautiful petal-based token usage visualization
- 🤖 Real-time agent status monitoring
- ⏰ Cron job management interface
- 📋 Activity feed with color-coded logs
- 🫧 Sub-agent status tracking
- 📊 System metrics display

## Development

### Prerequisites

- Node.js (v18 or higher)
- npm

### Installation

Dependencies are already installed. If you need to reinstall:

```bash
npm install
```

### Running the Development Server

```bash
# Standard development server
npm run dev
```

The dashboard will be available at `http://localhost:3000`

### Kiosk Mode (Full Screen)

For 800x480 displays, use the provided shell script:

```bash
./start-dashboard.sh
```

This script will:
- Start the Vite dev server
- Launch Chrome in kiosk mode at 800x480 resolution
- Automatically stop the dev server when Chrome is closed

## Configuration

The dashboard is configured for:
- **Display Size**: 800x480 pixels
- **No scrollbars**: Overflow hidden for fullscreen experience
- **Responsive design**: Optimized for the target display size
- **Google Fonts**: Quicksand and Comfortaa loaded via CDN

## Project Structure

```
rem-dashboard/
├── src/
│   ├── main.jsx           # Entry point
│   ├── App.jsx            # Main app component
│   └── rem-dashboard.jsx  # Dashboard component (copied from rem-face)
├── public/
│   └── vite.svg          # Favicon
├── index.html            # HTML template (configured for fullscreen)
├── package.json          # Dependencies and scripts
├── vite.config.js        # Vite configuration
├── start-dashboard.sh    # Kiosk mode launcher script
└── README.md            # This file
```

## Build for Production

```bash
npm run build
```

Built files will be in the `dist/` directory.

## Notes

- The dashboard component maintains its original design from `rem-face`
- All visual styling and mock data are preserved
- Fonts (Quicksand, Comfortaa) are loaded via Google Fonts CDN as specified in the original component
- No modifications were made to the visual design, only project structure setup