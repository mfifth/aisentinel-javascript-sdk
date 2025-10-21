# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of AISentinel JavaScript SDK
- Isomorphic SDK supporting both browser and Node.js environments
- Preflight checking for agent actions
- Offline mode with decision caching
- Local rulepack caching with IndexedDB/browser storage
- Multi-tenant support
- PII detection utilities
- Comprehensive TypeScript types
- Jest test suite
- Rollup build system for multiple targets

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- N/A

## [0.1.0] - 2025-10-20

### Added
- Core Governor class with preflight functionality
- Configuration management with environment variable support
- Storage drivers for different environments (IndexedDB, Node.js fs)
- Cache management with TTL support
- PII detection and masking utilities
- Offline queue processing
- Comprehensive error handling
- TypeScript declarations
- Dual package format (ESM + CommonJS)
- Browser and Node.js build targets
- Apache License 2.0
