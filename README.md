# AISentinel JavaScript SDK

[![npm version](https://badge.fury.io/js/%40aisentinel%2Fjavascript-sdk.svg)](https://www.npmjs.com/package/@aisentinel/javascript-sdk)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/aisentinel/aisentinel-javascript-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/aisentinel/aisentinel-javascript-sdk/actions/workflows/ci.yml)

The official JavaScript/TypeScript SDK for AISentinel - zero-latency governance for AI agents in browsers and Node.js.

## Features

- 🌐 **Isomorphic**: Works in both Node.js and modern browsers
- 🛡️ **Preflight Checks**: Validate agent actions before execution
- 💾 **Offline Support**: Continue operating when network connectivity is lost
- 📦 **Dual Builds**: ESM & CommonJS bundles for different environments
- 🔐 **PII Detection**: Client-side pattern matching for sensitive data
- 📡 **Real-time Updates**: Optional polling for live policy changes
- 🔄 **TypeScript First**: Full TypeScript support with comprehensive types

## Installation

```bash
npm install @aisentinel/javascript-sdk
```

## Quick Start

### Node.js

```typescript
import { Governor } from '@aisentinel/javascript-sdk';

const governor = new Governor({
  apiKey: process.env.AISENTINEL_API_KEY,
  baseURL: 'https://api.aisentinel.ai'
});

const result = await governor.preflight({
  tool: 'web_search',
  args: { query: 'typescript tutorials' }
}, {
  userId: 'user123',
  sessionId: 'sess456'
});

if (result.allowed) {
  // Execute your tool
  const results = await performWebSearch('typescript tutorials');
  console.log('Search results:', results);
} else {
  console.log('Blocked:', result.reasons);
}
```

### Browser

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import { Governor } from 'https://esm.sh/@aisentinel/javascript-sdk';

    const governor = new Governor({
      apiKey: 'your-api-key',
      baseURL: 'https://api.aisentinel.ai'
    });

    // Use the governor in your application
    async function checkAction() {
      const result = await governor.preflight({
        tool: 'api_call',
        args: { endpoint: '/api/data' }
      }, {
        userId: 'user123'
      });

      console.log('Decision:', result.allowed ? 'Allowed' : 'Blocked');
    }
  </script>
</head>
<body>
  <button onclick="checkAction()">Test Action</button>
</body>
</html>
```

## Advanced Usage

### Configuration

```typescript
import { Governor, resolveGovernorConfig } from '@aisentinel/javascript-sdk';

// Using environment variables
const config = resolveGovernorConfig({
  AISENTINEL_API_KEY: 'your-key',
  AISENTINEL_BASE_URL: 'https://api.aisentinel.ai',
  AISENTINEL_CACHE_TTL: '300'
});

const governor = new Governor(config);
```

### Offline Mode

The SDK automatically handles network interruptions:

```typescript
const governor = new Governor({
  apiKey: 'your-key',
  offlineMode: true
});

// If offline, decisions are cached or deferred
const result = await governor.preflight(candidate, context);
// Works even without network connectivity
```

### PII Detection

```typescript
import { detectPII, containsPII } from '@aisentinel/javascript-sdk';

const text = "Contact john.doe@example.com for more info";
const piiEntities = detectPII(text);
// Returns: [{ type: 'email', value: 'john.doe@example.com', start: 8, end: 27 }]

if (containsPII(text)) {
  console.log('PII detected in input');
}
```

### Custom Storage

```typescript
import { createStorageDriver } from '@aisentinel/javascript-sdk';

// Use custom storage implementation
const storage = createStorageDriver('memory'); // or 'indexeddb', 'filesystem'
const governor = new Governor({
  apiKey: 'your-key',
  storage
});
```

## API Reference

### Governor

The main SDK class for AISentinel governance.

#### Constructor

```typescript
new Governor(config: GovernorConfig)
```

#### Methods

- `preflight(candidate, context, options?)` - Check if an action is allowed
- `evaluate(payload)` - Evaluate against specific policies
- `fetchRulepack(rulepackId, version?)` - Fetch rulepack with caching
- `close()` - Clean up resources

### GovernorConfig

Configuration interface:

```typescript
interface GovernorConfig {
  apiKey: string;
  baseURL?: string;
  environment?: 'production' | 'development';
  cacheTTL?: number;
  offlineMode?: boolean;
  storage?: StorageDriver;
  tenantId?: string;
}
```

## Integration Examples

### Express.js Middleware

```typescript
import express from 'express';
import { Governor } from '@aisentinel/javascript-sdk';

const app = express();
const governor = new Governor({ apiKey: process.env.AISENTINEL_API_KEY });

app.use(async (req, res, next) => {
  const result = await governor.preflight({
    tool: 'http_request',
    args: {
      method: req.method,
      url: req.url
    }
  }, {
    userId: req.user?.id,
    ip: req.ip
  });

  if (!result.allowed) {
    return res.status(403).json({
      error: 'Request blocked by governance policy',
      reasons: result.reasons
    });
  }

  next();
});
```

### React Hook

```typescript
import { useState, useEffect } from 'react';
import { Governor } from '@aisentinel/javascript-sdk';

export function useGovernor() {
  const [governor, setGovernor] = useState<Governor | null>(null);

  useEffect(() => {
    const gov = new Governor({
      apiKey: process.env.REACT_APP_AISENTINEL_API_KEY
    });
    setGovernor(gov);

    return () => gov.close();
  }, []);

  return governor;
}

// Usage in component
function MyComponent() {
  const governor = useGovernor();

  const handleAction = async () => {
    if (!governor) return;

    const result = await governor.preflight({
      tool: 'data_export',
      args: { format: 'csv' }
    }, {
      userId: 'current-user'
    });

    if (result.allowed) {
      // Proceed with action
      exportData();
    }
  };

  return <button onClick={handleAction}>Export Data</button>;
}
```

### Next.js API Route

```typescript
import { Governor } from '@aisentinel/javascript-sdk';

let governor: Governor;

export default async function handler(req, res) {
  if (!governor) {
    governor = new Governor({
      apiKey: process.env.AISENTINEL_API_KEY
    });
  }

  const result = await governor.preflight({
    tool: 'api_call',
    args: {
      endpoint: req.url,
      method: req.method
    }
  }, {
    userId: req.headers['x-user-id']
  });

  if (!result.allowed) {
    return res.status(403).json({
      error: 'API call blocked',
      reasons: result.reasons
    });
  }

  // Continue with API logic
  res.status(200).json({ success: true });
}
```

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/aisentinel/aisentinel-javascript-sdk.git
cd aisentinel-javascript-sdk

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

### Build Targets

The SDK builds for multiple environments:

- **Browser**: ESM bundle with IndexedDB storage
- **Node.js**: CommonJS bundle with filesystem storage
- **Universal**: TypeScript declarations for both

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test -- --coverage
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://docs.aisentinel.ai/javascript)
- 🐛 [Issue Tracker](https://github.com/aisentinel/aisentinel-javascript-sdk/issues)
- 💬 [Community Forum](https://community.aisentinel.ai)
- 📧 [Email Support](mailto:support@aisentinel.ai)
