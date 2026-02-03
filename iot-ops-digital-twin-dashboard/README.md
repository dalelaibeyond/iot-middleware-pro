# IoT Ops Dashboard

A real-time digital twin dashboard for monitoring IoT devices and racks in a data center environment.

## Overview

The IoT Ops Dashboard connects to the IoT Middleware via REST API and WebSocket to provide a live view of:

- Device status and metadata
- Rack visualization with RFID tags
- Environmental monitoring (temperature, humidity, noise)
- Security status (door sensors)
- Real-time updates via WebSocket

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- IoT Middleware running on ports 3000 (API) and 3001 (WebSocket)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration

1. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

2. Configure the environment variables in `.env.local`:

   ```bash
   # API Configuration
   VITE_API_URL=http://localhost:3000

   # WebSocket Configuration
   VITE_WS_URL=ws://localhost:3001

   # Application Configuration
   VITE_APP_TITLE=IoT Ops Dashboard
   VITE_APP_VERSION=1.2.0
   ```

### Running the Dashboard

#### Development Mode

```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`

#### Production Build

```bash
npm run build
```

The optimized build will be created in the `dist` directory.

## Features

- **Real-time Updates**: WebSocket connection for live data streaming
- **Device Management**: View and monitor multiple devices and modules
- **Rack Visualization**: Visual representation of rack slots and RFID tags
- **Environmental Monitoring**: Temperature, humidity, and noise level tracking
- **Security Monitoring**: Door status monitoring with visual indicators
- **Error Handling**: Comprehensive error display and recovery options
- **Data Freshness Indicators**: Shows when data was last updated
- **Responsive Design**: Works on desktop and mobile devices

## Architecture

The dashboard is built with:

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **Axios** - HTTP client
- **Lucide React** - Icons

## API Integration

The dashboard integrates with the IoT Middleware through:

- **REST API**:
  - `GET /api/devices` - Fetch device list
  - `GET /api/devices/{id}/modules/{index}/state` - Fetch rack state
  - `POST /api/commands` - Send commands to devices
  - `GET /api/health` - Check middleware health

- **WebSocket**:
  - Real-time updates for device state changes
  - Supported message types: DEVICE_METADATA, HEARTBEAT, TEMP_HUM, RFID_SNAPSHOT, DOOR_STATE, NOISE, META_CHANGED_EVENT

## Documentation

- [API Documentation](./API_DOCUMENTATION.md) - Detailed API reference
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Production deployment instructions

## Development

### Project Structure

```
iot-ops-digital-twin-dashboard/
├── src/
│   ├── api/          # API client and endpoints
│   ├── components/    # React components
│   │   ├── layout/     # Layout components (Sidebar, TopBar)
│   │   ├── rack/       # Rack-specific components
│   │   └── ui/         # Reusable UI components
│   ├── hooks/         # Custom React hooks
│   ├── store/         # Zustand state management
│   ├── types/         # TypeScript type definitions
│   └── utils/         # Utility functions
├── .env.example        # Example environment configuration
├── .env.local          # Local environment configuration (gitignored)
├── vite.config.ts       # Vite configuration
└── package.json         # Dependencies and scripts
```

### Adding New Features

1. Create components in the appropriate directory
2. Add state to the store if needed
3. Update types for new data structures
4. Add API endpoints if required
5. Test with the middleware running

## Troubleshooting

### Connection Issues

1. **API Connection Failed**
   - Verify the middleware is running on port 3000
   - Check the `VITE_API_URL` in `.env.local`
   - Ensure no firewall is blocking the connection

2. **WebSocket Connection Failed**
   - Verify the middleware is running on port 3001
   - Check the `VITE_WS_URL` in `.env.local`
   - Check browser console for WebSocket errors

3. **Data Not Updating**
   - Verify WebSocket connection is established
   - Check if the middleware is emitting data updates
   - Enable debug mode: `localStorage.setItem('debug', 'true')`

### Performance Issues

1. **Slow Loading**
   - Check network latency to the middleware
   - Verify the middleware is not under heavy load
   - Consider enabling gzip compression on the server

2. **High Memory Usage**
   - Check for memory leaks in React components
   - Verify WebSocket messages are being cleaned up
   - Monitor the number of re-renders

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is part of the IoT Middleware Pro system.
