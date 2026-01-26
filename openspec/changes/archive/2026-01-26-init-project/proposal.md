# Change: Initialize Project Structure

## Why

The project needs to be scaffolded from scratch to establish the foundation for the IoT Middleware Pro system. This includes creating the complete directory structure, configuration files, database schema, and initial module stubs as defined in the architecture specification.

## What Changes

- Create complete directory structure under `src/` following the modular monolith pattern
- Create configuration file `src/config/default.json` with all required settings
- Create database schema SQL file with all required tables
- Create initial module stub files with basic structure for all components
- Create package.json with required dependencies
- Create entry point file `src/index.js`
- Create README.md with project documentation

**BREAKING:** None - this is a new project initialization

## Impact

- Affected specs: None (new project)
- Affected code: All new files under `src/` directory
- Dependencies: Node.js v18+, MySQL 8.0, MQTT broker required
