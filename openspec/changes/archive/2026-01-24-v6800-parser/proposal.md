# Change: Implement V6800 Parser Logic

## Why

The V6800 parser stub currently contains only placeholder methods. The full implementation is needed to parse JSON protocol messages from V6800 gateways according to the specification in `openspec/specs/03-V6800-parser.md`.

## What Changes

- Implement complete V6800 JSON parser logic based on specification
- Add message type mapping from msg_type field
- Implement field mapping (raw JSON fields to SIF keys)
- Add proper error handling with logging

**BREAKING:** None - this is a feature implementation

## Impact

- Affected specs: [`openspec/specs/03-V6800-parser.md`](openspec/specs/03-V6800-parser.md)
- Affected code: [`src/modules/parsers/V6800Parser.js`](src/modules/parsers/V6800Parser.js)
- Dependencies: None
