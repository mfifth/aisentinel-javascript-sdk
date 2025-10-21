# Contributing to AISentinel JavaScript SDK

Thank you for your interest in contributing to the AISentinel JavaScript SDK! We welcome contributions from the community.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/aisentinel/aisentinel-javascript-sdk.git
   cd aisentinel-javascript-sdk
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## Development Scripts

- `npm run build` - Build both browser and Node.js bundles
- `npm run build:browser` - Build browser bundle only
- `npm run build:node` - Build Node.js bundle only
- `npm run build:types` - Generate TypeScript declarations
- `npm run test` - Run tests with coverage
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Run ESLint

## Code Style

This project uses:
- **TypeScript** for type safety
- **ESLint** for code linting
- **Prettier** for code formatting
- **Jest** for testing

## Testing

- Write tests in the `tests/` directory
- Use `.test.ts` or `.spec.ts` extensions
- Run tests with `npm test`
- Aim for high test coverage

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`npm test && npm run lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Commit Messages

Use clear, descriptive commit messages. We follow conventional commits:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `test:` for tests
- `refactor:` for code refactoring

## Issues

- Check existing issues before creating new ones
- Use issue templates when available
- Provide clear reproduction steps for bugs

## Code of Conduct

Please be respectful and inclusive in all interactions. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
