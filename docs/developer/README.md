# Developer Guide Directory

This directory contains all development-related documentation for Stirling PDF.

## 📚 Documentation Index

### Core Development
- **[DeveloperGuide.md](./DeveloperGuide.md)** - Main developer setup and architecture guide
- **[Taskfile.yml](../../Taskfile.yml)** - Unified task runner for all build/dev/test/lint commands
- **[ADDING_TOOLS.md](./ADDING_TOOLS.md)** - How to add a PDF tool end to end
- **[EXCEPTION_HANDLING_GUIDE.md](./EXCEPTION_HANDLING_GUIDE.md)** - Exception handling patterns and i18n best practices
- **[CODE_COMMENTS.md](./CODE_COMMENTS.md)** - What a comment is for, what not to write, and the `task comment-lint` rules
- **[HowToAddNewLanguage.md](./HowToAddNewLanguage.md)** - Internationalization and translation guide
- **[STYLELINT.md](./STYLELINT.md)** - CSS and stylesheet linting rules and usage
- **[FILE_HISTORY_SPECIFICATION.md](./FILE_HISTORY_SPECIFICATION.md)** - File history and workflow state specifications

### Configuration & Operations
- **[DATABASE.md](./DATABASE.md)** - Database setup and configuration
- **[HowToUseOCR.md](./HowToUseOCR.md)** - OCR setup and configuration
- **[FILE_SHARING.md](./FILE_SHARING.md)** - File sharing and storage configuration
- **[STORAGE_ENCRYPTION_AT_REST.md](./STORAGE_ENCRYPTION_AT_REST.md)** - Encryption at rest for stored files: key setup, migration, revocation, rotation

### Features & Documentation
- **[AGENTS.md](../../AGENTS.md)** - Agent-based functionality documentation
- **[USERS.md](./USERS.md)** - User-focused documentation and guides
- **[counter_translation.md](../counter_translation.md)** - Translation progress calculation script documentation
- **[data-extraction.md](../data-extraction.md)** - Data extraction specifications and tool workflows
- **[type3_fallback_plan.md](../type3_fallback_plan.md)** - Type3 font fallback plan and library catalog

## 🔗 Related Files in Root
- **[README.md](../../README.md)** - Project overview and quick start
- **[CONTRIBUTING.md](../../.github/CONTRIBUTING.md)** - Contribution guidelines
- **[SECURITY.md](../../.github/SECURITY.md)** - Security policies and reporting

## 📝 Contributing to Documentation

When adding new development documentation:
1. Place technical guides in this `docs/developer/` directory
2. Update this index file with a brief description
3. Keep user-facing docs (README, CONTRIBUTING, SECURITY) in the root
4. Follow existing naming conventions (PascalCase for guides)
