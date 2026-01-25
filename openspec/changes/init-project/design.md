## Context

The IoT Middleware Pro project is a new system that needs to be scaffolded from scratch. The architecture specification defines a modular monolith pattern with event-driven architecture. The system must handle high-throughput data from heterogeneous IoT gateways (V5008/Binary and V6800/JSON) and provide real-time and historical data access.

### Constraints

- Runtime: Node.js v18+
- Language: JavaScript (CommonJS)
- Database: MySQL 8.0
- Transport: MQTT
- Architecture: Modular Monolith (Event-Driven)

### Stakeholders

- Developers implementing the system
- Operations teams deploying and maintaining the system
- Dashboard users consuming the API

## Goals / Non-Goals

### Goals

- Establish a complete, working directory structure matching the architecture spec
- Create all necessary stub files with basic structure for future implementation
- Provide configuration file with all required settings
- Create database schema with all required tables
- Establish clear entry point for the application

### Non-Goals

- Full implementation of all module logic (stubs only)
- Testing infrastructure (to be added in later changes)
- CI/CD pipeline setup (to be added in later changes)
- Docker containerization (to be added in later changes)

## Decisions

### Decision 1: Directory Structure

**What:** Use the exact directory structure defined in the architecture specification.

**Why:**

- The architecture spec is the authoritative source for project structure
- Ensures consistency with the planned implementation
- Makes it easy for developers to locate and understand code organization

**Alternatives considered:**

- Custom structure: Rejected - would deviate from the spec
- Microservices architecture: Rejected - overkill for initial setup

### Decision 2: Module Pattern

**What:** Use CommonJS module pattern with `require()` and `module.exports`.

**Why:**

- Specified in project.md as the language standard
- Simpler than ES modules for Node.js v18+
- Better compatibility with existing ecosystem

**Alternatives considered:**

- ES Modules: Rejected - not specified in project.md
- TypeScript: Rejected - not specified in project.md

### Decision 3: Configuration Management

**What:** Use `config/default.json` as the single source of configuration truth.

**Why:**

- Specified in project.md as the config standard
- Simple and easy to understand
- No external dependencies required

**Alternatives considered:**

- Environment variables only: Rejected - harder to manage complex config
- Multiple config files (dev/prod): Rejected - can be added later

### Decision 4: Database Schema File

**What:** Create a single `database/schema.sql` file with all table definitions.

**Why:**

- Single source of truth for database structure
- Easy to execute and version control
- Matches the architecture spec's single schema definition

**Alternatives considered:**

- Migration files (Knex): Rejected - can be added later
- Separate files per table: Rejected - adds unnecessary complexity

### Decision 5: Module Stub Implementation

**What:** Create minimal stub files with basic class/function exports and placeholder comments.

**Why:**

- Establishes the file structure without full implementation
- Provides clear starting points for future development
- Allows validation of the overall structure

**Alternatives considered:**

- Empty files: Rejected - less informative
- Full implementation: Rejected - out of scope for this change

## Risks / Trade-offs

### Risk 1: Missing Dependencies

**Risk:** The package.json may not include all necessary dependencies for full implementation.

**Mitigation:** Dependencies will be added as needed during implementation of individual modules.

### Risk 2: Schema Changes

**Risk:** Database schema may need to be modified during implementation.

**Mitigation:** The schema file will be updated as needed; initial version provides a solid foundation.

### Trade-off: Stub vs Full Implementation

**Decision:** Create stub files rather than full implementation.

**Rationale:**

- Reduces initial scope and complexity
- Allows faster iteration on individual modules
- Follows the spec-driven development approach

## Migration Plan

### Steps

1. Create directory structure
2. Create configuration file
3. Create database schema file
4. Create core module stubs
5. Create ingress module stubs
6. Create parser module stubs
7. Create normalizer module stubs
8. Create storage module stubs
9. Create command module stubs
10. Create output module stubs
11. Create entry point file
12. Create project documentation

### Rollback

Since this is a new project initialization, rollback is simply deleting the created files. No existing code is affected.

## Open Questions

None at this time. The architecture specification provides clear guidance for all aspects of the project structure.
