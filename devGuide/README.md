# Developer Guide Directory

This directory contains all development-related documentation for Stirling PDF.

## 📚 Documentation Index

### Core Development
- **[DeveloperGuide.md](../DeveloperGuide.md)** - Main developer setup and architecture guide (in repo root)
- **[Taskfile.yml](../Taskfile.yml)** - Unified task runner for all build/dev/test/lint commands
- **[EXCEPTION_HANDLING_GUIDE.md](./EXCEPTION_HANDLING_GUIDE.md)** - Exception handling patterns and i18n best practices
- **[CODE_COMMENTS.md](./CODE_COMMENTS.md)** - What a comment is for, what not to write, and the `task comment-lint` rules
- **[HowToAddNewLanguage.md](./HowToAddNewLanguage.md)** - Internationalization and translation guide
- **[STORAGE_ENCRYPTION_AT_REST.md](./STORAGE_ENCRYPTION_AT_REST.md)** - Encryption at rest for stored files: key setup, migration, revocation, rotation
- **[ADDING_TOOLS.md](./ADDING_TOOLS.md)** - Guide for creating new PDF tools
- **[WINDOWS_SIGNING.md](./WINDOWS_SIGNING.md)** - Windows code signing for desktop builds

### Features & Documentation
- **[USERS.md](./USERS.md)** - User-focused documentation and guides
- **[FILE_SHARING.md](./FILE_SHARING.md)** - File sharing and collaboration
- **[SHARED_SIGNING.md](./SHARED_SIGNING.md)** - Shared/group signing workflow
- **[DATABASE.md](./DATABASE.md)** - Database setup and configuration (usage guide)
- **[HowToUseOCR.md](./HowToUseOCR.md)** - OCR setup and configuration (usage guide)

## 🔗 Related Files in Root
- **[README.md](../README.md)** - Project overview and quick start
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - Contribution guidelines
- **[SECURITY.md](../SECURITY.md)** - Security policies and reporting
- **[AGENTS.md](../AGENTS.md)** - Architecture and conventions for AI coding agents

## 📝 Contributing to Documentation

When adding new development documentation:
1. Place technical guides in this `devGuide/` directory
2. Update this index file with a brief description
3. Keep user-facing docs (README, CONTRIBUTING, SECURITY) in the root
4. Follow existing naming conventions (PascalCase for guides)
