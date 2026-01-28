# Design: Config Directory Restructuring

## Current State Analysis

### Directory Structure
```
iot-middleware-pro/
├── src/
│   ├── config/
│   │   └── default.json
│   ├── core/
│   ├── modules/
│   └── index.js
├── openspec/
├── database/
└── tests/
```

### Config Import Patterns Found

1. **npm config package** (8 files):
   - `src/index.js`: `const config = require("config");`
   - `src/core/Database.js`: `const config = require("config");`
   - `src/modules/ingress/MqttSubscriber.js`: `const mqttConfig = require("config").get("mqtt");`
   - `src/modules/command/CommandService.js`: `const mqttConfig = require("config").get("mqtt");`
   - `src/modules/output/MqttRelay.js`: `const mqttConfig = require("config").get("mqtt");`
   - `src/modules/output/ApiServer.js`: `const config = require("config");`
   - `src/modules/normalizer/CacheWatchdog.js`: `const normalizerConfig = require("config").get("normalizer");`

2. **Relative path** (1 file):
   - `src/core/ModuleManager.js`: `const config = require("../../config/default.json");`

## Target State

### Directory Structure (per v3.3 spec)
```
iot-middleware-pro/
├── config/                 <-- NEW LOCATION
│   └── default.json
├── src/
│   ├── core/
│   ├── modules/
│   └── index.js
├── openspec/
├── database/
└── tests/
```

## Technical Details

### npm config Package Behavior

The `config` npm package (v3.3.9) automatically searches for configuration files in the following order:
1. `$NODE_CONFIG` environment variable (if set)
2. `./config/` directory at project root
3. `$HOME/config/` directory

By moving `config/` to the project root, we align with the package's default behavior and eliminate the need for relative path imports.

### ModuleManager.js Import Change

**Before:**
```javascript
const config = require("../../config/default.json");
```

**After:**
```javascript
const config = require("config");
```

**Rationale:**
- The npm `config` package provides additional features:
  - Environment-specific configs (development, production, test)
  - Config file merging
  - Runtime config overrides
  - Type-safe config access via `.get()`
- Consistent with all other files in the project
- Eliminates brittle relative paths

### Config Access Patterns

After the move, all config access will use:
```javascript
// Get entire config object
const config = require("config");

// Get nested config
const mqttConfig = require("config").get("mqtt");
const dbConfig = require("config").get("database");
const moduleConfig = require("config").get(`modules.${moduleName}`);
```

## Migration Strategy

### Step-by-Step Process

1. **Backup**: Create backup of `src/config/default.json`
2. **Create Target**: Create `./config/` directory
3. **Move File**: Copy `src/config/default.json` to `./config/default.json`
4. **Verify Content**: Ensure file content is identical
5. **Update Code**: Change ModuleManager.js import
6. **Test Load**: Verify config loads correctly
7. **Clean Up**: Remove `src/config/` directory
8. **Final Test**: Run full application

### Rollback Plan

If issues arise:
1. Restore `src/config/default.json` from backup
2. Revert ModuleManager.js import
3. Remove `./config/` directory
4. Verify application works

## Validation Checklist

### File Structure
- [ ] `./config/default.json` exists
- [ ] `src/config/` does not exist
- [ ] Config file content is identical

### Code Updates
- [ ] ModuleManager.js uses `require("config")`
- [ ] No other files use relative config imports

### Runtime Validation
- [ ] `require("config")` returns config object
- [ ] `config.get("app.name")` returns "IoT Middleware Pro"
- [ ] `config.get("mqtt.brokerUrl")` returns broker URL
- [ ] `config.get("modules.storage.enabled")` returns boolean
- [ ] Application starts without errors
- [ ] All modules initialize successfully

## Edge Cases

### Environment-Specific Configs

The npm `config` package supports environment-specific configs:
- `config/default.json` - Base configuration
- `config/development.json` - Development overrides
- `config/production.json` - Production overrides
- `config/test.json` - Test overrides

These can be added in the future without code changes.

### Config File Format

The current `default.json` uses nested JSON:
```json
{
  "app": { "name": "...", "version": "..." },
  "mqtt": { "brokerUrl": "...", "topics": {...} },
  "modules": { "storage": {...}, "api": {...} }
}
```

This format is fully compatible with the npm `config` package.

## Performance Impact

**Negligible:**
- Config is loaded once at application startup
- No runtime performance difference
- Slightly faster startup (no relative path resolution)

## Security Considerations

**No Impact:**
- Config file location does not affect security
- `.env` file remains at project root for secrets
- Config file should not contain sensitive data (per best practices)
