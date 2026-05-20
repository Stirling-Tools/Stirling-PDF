# Convert Tool Test Suite

This directory contains comprehensive tests for the Convert Tool functionality.

## Test Files Overview

### 1. ConvertTool.test.tsx
**Purpose**: Unit/Component testing for the Convert Tool UI components
- Tests dropdown behavior and navigation
- Tests format availability based on endpoint status
- Tests UI state management and form validation
- Mocks backend dependencies for isolated testing

**Key Test Areas**:
- FROM dropdown enables/disables formats based on endpoint availability
- TO dropdown shows correct conversions for selected source format
- Format-specific options appear/disappear correctly
- Parameter validation and state management

### 2. ConvertIntegration.test.ts
**Purpose**: Integration testing for Convert Tool business logic
- Tests parameter validation and conversion matrix logic
- Tests endpoint resolution and availability checking
- Tests file extension detection
- Provides framework for testing actual conversions (requires backend)

**Key Test Areas**:
- Endpoint availability checking matches real backend status
- Conversion parameters are correctly validated
- File extension detection works properly
- Conversion matrix returns correct available formats

### 3. ConvertE2E.spec.ts
**Purpose**: End-to-End testing using Playwright with Dynamic Endpoint Discovery
- **Automatically discovers available conversion endpoints** from the backend
- Tests complete user workflows from file upload to download
- Tests actual file conversions with real backend
- **Skips tests for unavailable endpoints** automatically
- Tests error handling and edge cases
- Tests UI/UX flow and user interactions

**Key Test Areas**:
- **Dynamic endpoint discovery** using `/api/v1/config/endpoints-enabled` API
- Complete conversion workflows for **all available endpoints**
- **Unavailable endpoint testing** - verifies disabled conversions are properly blocked
- File upload, conversion, and download process
- Error handling for corrupted files and network issues
- Performance testing with large files
- UI responsiveness and progress indicators

**Supported Conversions** (tested if available):
- PDF ↔ Images (PNG, JPG, GIF, BMP, TIFF, WebP)
- PDF ↔ Office (DOCX, PPTX) 
- PDF ↔ Text (TXT, HTML, XML, CSV, Markdown)
- Office → PDF (DOCX, PPTX, XLSX, etc.)
- Email (EML) → PDF
- HTML → PDF, URL → PDF
- Markdown → PDF

## Running the Tests

**Important**: All commands should be run from the `frontend/` directory:
```bash
cd frontend
```

### Setup (First Time Only)
```bash
# Install dependencies (includes test frameworks)
npm install

# Install Playwright browsers for E2E tests
npx playwright install
```

### Unit Tests (ConvertTool.test.tsx)
```bash
# Run all unit tests
npm test

# Run specific test file
npm test ConvertTool.test.tsx

# Run with coverage
npm run test:coverage

# Run in watch mode (re-runs on file changes)
npm run test:watch

# Run specific test pattern
npm test -- --grep "dropdown"
```

### Integration Tests (ConvertIntegration.test.ts)
```bash
# Run integration tests
npm test ConvertIntegration.test.ts

# Run with verbose output
npm test ConvertIntegration.test.ts -- --reporter=verbose
```

### E2E Tests (ConvertE2E.spec.ts)
```bash
# Prerequisites: Backend must be running on localhost:8080
# Start backend first, then:

# Run all E2E tests (automatically discovers available endpoints)
npm run test:e2e

# Run specific E2E test file
npx playwright test ConvertE2E.spec.ts

# Run with UI mode for debugging
npx playwright test --ui

# Run specific test by endpoint name (dynamic)
npx playwright test -g "pdf-to-img:"

# Run only available conversion tests
npx playwright test -g "Dynamic Conversion Tests"

# Run only unavailable conversion tests  
npx playwright test -g "Unavailable Conversions"

# Run in headed mode (see browser)
npx playwright test --headed

# Generate HTML report
npx playwright test ConvertE2E.spec.ts --reporter=html
```

**Test Discovery Process:**
1. Tests automatically query `/api/v1/config/endpoints-enabled` to discover available conversions
2. Tests are generated dynamically for each available endpoint
3. Tests for unavailable endpoints verify they're properly disabled in the UI
4. Console output shows which endpoints were discovered

## Test Requirements

### For Unit Tests
- No special requirements
- All dependencies are mocked
- Can run in any environment

### For Integration Tests
- May require backend API for full functionality
- Uses mock data for endpoint availability
- Tests business logic in isolation

### For E2E Tests
- **Requires running backend server** (localhost:8080)
- **Requires test fixture files** (see ../test-fixtures/README.md)
- Requires frontend dev server (localhost:5173)
- Tests real conversion functionality

## Test Data

The tests use realistic endpoint availability data based on your current server configuration:

**Available Endpoints** (should pass):
- `file-to-pdf`: true (DOCX, XLSX, PPTX → PDF)
- `img-to-pdf`: true (PNG, JPG, etc. → PDF)
- `markdown-to-pdf`: true (MD → PDF)
- `pdf-to-csv`: true (PDF → CSV)
- `pdf-to-img`: true (PDF → PNG, JPG, etc.)
- `pdf-to-text`: true (PDF → TXT)

**Disabled Endpoints** (should be blocked):
- `eml-to-pdf`: false
- `html-to-pdf`: false
- `pdf-to-html`: false
- `pdf-to-markdown`: false
- `pdf-to-pdfa`: false
- `pdf-to-presentation`: false
- `pdf-to-word`: false
- `pdf-to-xml`: false

## Test Scenarios

### Success Scenarios (Available Endpoints)
1. **PDF → Image**: PDF to PNG/JPG with various DPI and color settings
2. **PDF → Data**: PDF to CSV (table extraction), PDF to TXT (text extraction)
3. **Office → PDF**: DOCX/XLSX/PPTX to PDF conversion
4. **Image → PDF**: PNG/JPG to PDF with image options
5. **Markdown → PDF**: MD to PDF with formatting preservation

### Blocked Scenarios (Disabled Endpoints)
1. **EML conversions**: Should be disabled in FROM dropdown
2. **PDF → Office**: PDF to Word/PowerPoint should be disabled
3. **PDF → Web**: PDF to HTML/XML should be disabled
4. **PDF → PDF/A**: Should be disabled

### Error Scenarios
1. **Corrupted files**: Should show helpful error messages
2. **Network failures**: Should handle backend unavailability
3. **Large files**: Should handle memory constraints gracefully
4. **Invalid parameters**: Should validate before submission

## Adding New Tests

When adding new conversion formats:

1. **Update ConvertTool.test.tsx**:
   - Add the new format to test data
   - Test dropdown behavior for the new format
   - Test format-specific options if any

2. **Update ConvertIntegration.test.ts**:
   - Add endpoint availability test cases
   - Add conversion matrix test cases
   - Add parameter validation tests

3. **Update ConvertE2E.spec.ts**:
   - Add end-to-end workflow tests
   - Add test fixture files
   - Test actual conversion functionality

4. **Update test fixtures**:
   - Add sample files for the new format
   - Update ../test-fixtures/README.md

## Debugging Failed Tests

### Unit Test Failures
- Check mock data matches real endpoint status
- Verify component props and state management
- Check for React hook dependency issues

### Integration Test Failures
- Verify conversion matrix includes new formats
- Check endpoint name mappings
- Ensure parameter validation logic is correct

### E2E Test Failures
- Ensure backend server is running
- Check test fixture files exist and are valid
- Verify element selectors match current UI
- Check for timing issues (increase timeouts if needed)

## Test Maintenance

### Regular Updates Needed
1. **Endpoint Status**: Update mock data when backend endpoints change
2. **UI Selectors**: Update test selectors when UI changes
3. **Test Fixtures**: Replace old test files with new ones periodically
4. **Performance Benchmarks**: Update expected performance metrics

### CI/CD Integration
- Unit tests: Run on every commit
- Integration tests: Run on pull requests  
- E2E tests: Run on staging deployment
- Performance tests: Run weekly or on major releases

## Performance Expectations

These tests focus on frontend functionality, not backend performance:

- **File upload/UI**: < 1 second for small test files
- **Dropdown interactions**: < 200ms 
- **Form validation**: < 100ms
- **Conversion UI flow**: < 5 seconds for small test files

Tests will fail if UI interactions are slow, indicating frontend performance issues.