# Claudeware Documentation

Welcome to the Claudeware documentation! This directory contains comprehensive guides and references for using and extending the wrapper.

## 📚 Documentation Index

### Getting Started
- **[Quick Start Guide](./QUICK-START.md)** - Get up and running in 5 minutes
- **[Installation Guide](./INSTALLATION.md)** - Detailed installation instructions
- **[Configuration Guide](./CONFIGURATION.md)** - Complete configuration reference

### Core Documentation
- **[Architecture Overview](./ARCHITECTURE.md)** - Deep dive into the wrapper's design
- **[Plugin API Documentation](./PLUGIN-API.md)** - Everything about creating plugins
- **[API Reference](./API-REFERENCE.md)** - Complete API documentation

### Guides and Tutorials
- **[Writing Your First Plugin](./tutorials/FIRST-PLUGIN.md)** - Step-by-step plugin tutorial
- **[SDK Integration Guide](./guides/SDK-INTEGRATION.md)** - Using the wrapper with the SDK
- **[Analytics Guide](./guides/ANALYTICS.md)** - Analyzing collected query data
- **[Performance Tuning](./guides/PERFORMANCE.md)** - Optimizing wrapper performance

### Advanced Topics
- **[Security Best Practices](./advanced/SECURITY.md)** - Security considerations
- **[Scaling Guide](./advanced/SCALING.md)** - Running at scale
- **[Custom Storage Backends](./advanced/STORAGE.md)** - Beyond SQLite
- **[Remote Plugins](./advanced/REMOTE-PLUGINS.md)** - Distributed plugin architecture

### Reference
- **[Troubleshooting Guide](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[FAQ](./FAQ.md)** - Frequently asked questions
- **[Changelog](../CHANGELOG.md)** - Version history
- **[Contributing](../CONTRIBUTING.md)** - How to contribute

## 🎯 Quick Navigation

### By User Type

#### 👤 End Users
Start here if you want to use the wrapper:
1. [Quick Start Guide](./QUICK-START.md)
2. [Configuration Guide](./CONFIGURATION.md)
3. [FAQ](./FAQ.md)

#### 🔌 Plugin Developers
Building plugins? Check these:
1. [Plugin API Documentation](./PLUGIN-API.md)
2. [Writing Your First Plugin](./tutorials/FIRST-PLUGIN.md)
3. [API Reference](./API-REFERENCE.md)

#### 🏗️ Contributors
Want to contribute? Read:
1. [Architecture Overview](./ARCHITECTURE.md)
2. [Contributing Guide](../CONTRIBUTING.md)
3. [Development Setup](./guides/DEVELOPMENT.md)

#### 📊 Data Analysts
Analyzing Claude usage? See:
1. [Analytics Guide](./guides/ANALYTICS.md)
2. [Query Patterns](./guides/QUERY-PATTERNS.md)
3. [Reporting Tools](./guides/REPORTING.md)

## 📖 Document Conventions

Throughout the documentation, we use these conventions:

- 📝 **Note**: Important information
- ⚠️ **Warning**: Critical warnings
- 💡 **Tip**: Helpful tips
- 🚀 **Performance**: Performance considerations
- 🔒 **Security**: Security implications
- 🐛 **Debug**: Debugging information

### Code Examples

Code examples are provided in multiple languages:

**TypeScript** (primary):
```typescript
import { createWrappedSDK } from 'claudeware';
```

**JavaScript**:
```javascript
const { createWrappedSDK } = require('claudeware');
```

**Shell**:
```bash
claudeware --version
```

## 🔍 Search Documentation

Looking for something specific? Use GitHub's search feature:

```
repo:instantlyeasy/claudeware path:docs your-search-term
```

Or use grep locally:

```bash
grep -r "your search term" docs/
```

## 📚 Additional Resources

### External Links
- [Claude Code SDK Documentation](https://github.com/anthropics/claude-code-sdk-ts)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [Node.js Stream API](https://nodejs.org/api/stream.html)

### Community
- [Discord Server](https://discord.gg/claude-wrapper)
- [GitHub Discussions](https://github.com/instantlyeasy/claudeware/discussions)
- [Stack Overflow Tag](https://stackoverflow.com/questions/tagged/claudeware)

### Tools and Utilities
- [Plugin Template](https://github.com/instantlyeasy/claude-plugin-template)
- [Analytics Dashboard](https://github.com/instantlyeasy/claude-analytics)
- [Migration Tools](https://github.com/instantlyeasy/claude-wrapper-migrate)

## 💬 Getting Help

If you can't find what you're looking for:

1. **Check the FAQ**: [Frequently Asked Questions](./FAQ.md)
2. **Search Issues**: [GitHub Issues](https://github.com/instantlyeasy/claudeware/issues)
3. **Ask on Discord**: [Join our community](https://discord.gg/claude-wrapper)
4. **Open an Issue**: [Create a new issue](https://github.com/instantlyeasy/claudeware/issues/new)

## 📝 Documentation Feedback

Found an error or have a suggestion? 

- **Small fixes**: Click "Edit this page" on GitHub
- **Large changes**: Open an issue to discuss first
- **New guides**: We welcome contributions!

See [Contributing to Documentation](../CONTRIBUTING.md#documentation) for guidelines.

---

Happy coding with Claudeware! 🚀