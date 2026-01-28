# Change: Restructure Project Folders to Match v3.3 Architecture

## Why

The Master Architecture Blueprint (v3.3) specifies that the `config/` directory should be at the project root, not within `src/`. This is a standard Node.js project structure that aligns with the `config` npm package's expectations and improves project organization. The current structure has `src/config/` which needs to be moved to the root level.

## What Changes

- Move `src/config/` directory to `./config/` at project root
- Update import statements in source files to reference the new config location
- Verify all other folders (core, modules) match the v3.3 spec

**BREAKING:** This change requires updating the config import in `src/core/ModuleManager.js`

## Impact

- Affected specs: `01-architecture.md` (Section 1.1 Directory Structure)
- Affected code:
  - `src/core/ModuleManager.js` - requires path update from `require("../../config/default.json")` to `require("config")`
  - All other files already use `require("config")` and will work automatically after the move
- Dependencies: None (uses existing `config` npm package v3.3.9)

## Implementation Plan

### Phase 1: Preparation
- Verify current state: `src/config/` exists, `./config/` does not exist
- Confirm all files using config (except ModuleManager.js) use npm `config` package

### Phase 2: Directory Restructuring
- Create `./config/` directory at project root
- Move `src/config/default.json` to `./config/default.json`
- Remove empty `src/config/` directory

### Phase 3: Code Updates
- Update `src/core/ModuleManager.js` line 8:
  - From: `const config = require("../../config/default.json");`
  - To: `const config = require("config");`
- Scan all `src/**/*.js` files for any other relative config imports (expected: none)

### Phase 4: Verification
- Verify npm `config` package can load configuration from `./config/`
- Test that `require("config").get()` works correctly from all modules
- Run application to ensure no config-related errors
- Verify all modules can access their configuration

## Risk Assessment

**Low Risk:**
- The `config` npm package is designed to automatically look for configuration files in `./config/` at the project root
- Most files already use `require("config")` and will work without changes
- Only one file needs modification (ModuleManager.js)

**Mitigation:**
- Test configuration loading before and after the move
- Ensure backup of original config directory is kept during migration
- Verify all config values are accessible after the move

## Success Criteria

- `./config/default.json` exists at project root
- `src/config/` directory no longer exists
- All modules can load configuration via `require("config")`
- Application starts without configuration errors
- All module-specific config settings are accessible
