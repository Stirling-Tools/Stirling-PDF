/**
 * End-to-End Tests for Convert Tool
 * 
 * These tests dynamically discover available conversion endpoints and test them.
 * Tests are automatically skipped if the backend endpoint is not available.
 * 
 * Run with: npm run test:e2e or npx playwright test
 */

import { test, expect, Page } from '@playwright/test';
import { 
  conversionDiscovery, 
  type ConversionEndpoint 
} from '../helpers/conversionEndpointDiscovery';
import * as path from 'path';
import * as fs from 'fs';

// Test configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

/**
 * Resolves test fixture paths dynamically based on current working directory.
 * Works from both top-level project directory and frontend subdirectory.
 */
function resolveTestFixturePath(filename: string): string {
  const cwd = process.cwd();
  
  // Try frontend/src/tests/test-fixtures/ first (from top-level)
  const topLevelPath = path.join(cwd, 'frontend', 'src', 'tests', 'test-fixtures', filename);
  if (fs.existsSync(topLevelPath)) {
    return topLevelPath;
  }
  
  // Try src/tests/test-fixtures/ (from frontend directory)
  const frontendPath = path.join(cwd, 'src', 'tests', 'test-fixtures', filename);
  if (fs.existsSync(frontendPath)) {
    return frontendPath;
  }
  
  // Try relative path from current test file location
  const relativePath = path.join(__dirname, '..', 'test-fixtures', filename);
  if (fs.existsSync(relativePath)) {
    return relativePath;
  }
  
  // Fallback to the original path format (should work from top-level)
  return path.join('.', 'frontend', 'src', 'tests', 'test-fixtures', filename);
}

// Test file paths (dynamically resolved based on current working directory)
const TEST_FILES = {
  pdf: resolveTestFixturePath('sample.pdf'),
  docx: resolveTestFixturePath('sample.docx'),
  doc: resolveTestFixturePath('sample.doc'),
  pptx: resolveTestFixturePath('sample.pptx'),
  ppt: resolveTestFixturePath('sample.ppt'),
  xlsx: resolveTestFixturePath('sample.xlsx'),
  xls: resolveTestFixturePath('sample.xls'),
  png: resolveTestFixturePath('sample.png'),
  jpg: resolveTestFixturePath('sample.jpg'),
  jpeg: resolveTestFixturePath('sample.jpeg'),
  gif: resolveTestFixturePath('sample.gif'),
  bmp: resolveTestFixturePath('sample.bmp'),
  tiff: resolveTestFixturePath('sample.tiff'),
  webp: resolveTestFixturePath('sample.webp'),
  md: resolveTestFixturePath('sample.md'),
  eml: resolveTestFixturePath('sample.eml'),
  html: resolveTestFixturePath('sample.html'),
  txt: resolveTestFixturePath('sample.txt'),
  xml: resolveTestFixturePath('sample.xml'),
  csv: resolveTestFixturePath('sample.csv')
};

// File format to test file mapping
const getTestFileForFormat = (format: string): string => {
  const formatMap: Record<string, string> = {
    'pdf': TEST_FILES.pdf,
    'docx': TEST_FILES.docx,
    'doc': TEST_FILES.doc,
    'pptx': TEST_FILES.pptx,
    'ppt': TEST_FILES.ppt,
    'xlsx': TEST_FILES.xlsx,
    'xls': TEST_FILES.xls,
    'office': TEST_FILES.docx, // Default office file
    'image': TEST_FILES.png, // Default image file
    'png': TEST_FILES.png,
    'jpg': TEST_FILES.jpg,
    'jpeg': TEST_FILES.jpeg,
    'gif': TEST_FILES.gif,
    'bmp': TEST_FILES.bmp,
    'tiff': TEST_FILES.tiff,
    'webp': TEST_FILES.webp,
    'md': TEST_FILES.md,
    'eml': TEST_FILES.eml,
    'html': TEST_FILES.html,
    'txt': TEST_FILES.txt,
    'xml': TEST_FILES.xml,
    'csv': TEST_FILES.csv
  };
  
  return formatMap[format] || TEST_FILES.pdf; // Fallback to PDF
};

// Expected file extensions for target formats
const getExpectedExtension = (toFormat: string): string => {
  const extensionMap: Record<string, string> = {
    'pdf': '.pdf',
    'docx': '.docx',
    'pptx': '.pptx',
    'txt': '.txt',
    'html': '.html',
    'xml': '.xml',
    'csv': '.csv',
    'md': '.md',
    'image': '.png', // Default for image conversion
    'png': '.png',
    'jpg': '.jpg',
    'jpeg': '.jpeg',
    'gif': '.gif',
    'bmp': '.bmp',
    'tiff': '.tiff',
    'webp': '.webp',
    'pdfa': '.pdf'
  };
  
  return extensionMap[toFormat] || '.pdf';
};

/**
 * Generic test function for any conversion
 */
async function testConversion(page: Page, conversion: ConversionEndpoint) {
  const expectedExtension = getExpectedExtension(conversion.toFormat);
  
  console.log(`Testing ${conversion.endpoint}: ${conversion.fromFormat} → ${conversion.toFormat}`);
  
  // File should already be uploaded, click the Convert tool button
  await page.click('[data-testid="tool-convert"]');
  
  // Wait for the FileEditor to load in convert mode with file thumbnails
  await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 5000 });
  
  // Click the file thumbnail checkbox to select it in the FileEditor
  await page.click('[data-testid="file-thumbnail-checkbox"]');
  
  // Wait for the conversion settings to appear after file selection
  await page.waitForSelector('[data-testid="convert-from-dropdown"]', { timeout: 5000 });
  
  // Select FROM format
  await page.click('[data-testid="convert-from-dropdown"]');
  const fromFormatOption = page.locator(`[data-testid="format-option-${conversion.fromFormat}"]`);
  await fromFormatOption.scrollIntoViewIfNeeded();
  await fromFormatOption.click();
  
  // Select TO format
  await page.click('[data-testid="convert-to-dropdown"]');
  const toFormatOption = page.locator(`[data-testid="format-option-${conversion.toFormat}"]`);
  await toFormatOption.scrollIntoViewIfNeeded();
  await toFormatOption.click();
  
  // Handle format-specific options
  if (conversion.toFormat === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'webp'].includes(conversion.toFormat)) {
    // Set image conversion options if they appear
    const imageOptionsVisible = await page.locator('[data-testid="image-options-section"]').isVisible().catch(() => false);
    if (imageOptionsVisible) {
      // Click the color type dropdown and select "Color"
      await page.click('[data-testid="color-type-select"]');
      await page.getByRole('option', { name: 'Color' }).click();
      
      // Set DPI value
      await page.fill('[data-testid="dpi-input"]', '150');
      
      // Click the output type dropdown and select "Multiple"
      await page.click('[data-testid="output-type-select"]');
      
      await page.getByRole('option', { name: 'multiple' }).click();
    }
  }
  
  if (conversion.fromFormat === 'image' && conversion.toFormat === 'pdf') {
    // Set PDF creation options if they appear
    const pdfOptionsVisible = await page.locator('[data-testid="pdf-options-section"]').isVisible().catch(() => false);
    if (pdfOptionsVisible) {
      // Click the color type dropdown and select "Color"
      await page.click('[data-testid="color-type-select"]');
      await page.locator('[data-value="color"]').click();
    }
  }
  
  if (conversion.fromFormat === 'pdf' && conversion.toFormat === 'csv') {
    // Set CSV extraction options if they appear
    const csvOptionsVisible = await page.locator('[data-testid="csv-options-section"]').isVisible().catch(() => false);
    if (csvOptionsVisible) {
      // Set specific page numbers for testing (test pages 1-2)
      await page.fill('[data-testid="page-numbers-input"]', '1-2');
    }
  }
  
  // Start conversion
  await page.click('[data-testid="convert-button"]');
  
  // Wait for conversion to complete (with generous timeout)
  await page.waitForSelector('[data-testid="download-button"]', { timeout: 60000 });
  
  // Verify download is available
  const downloadButton = page.locator('[data-testid="download-button"]');
  await expect(downloadButton).toBeVisible();
  
  // Start download and verify file
  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadPromise;
  
  // Verify file extension
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\${expectedExtension}$`));
  
  // Save and verify file is not empty
  const path = await download.path();
  if (path) {
    const fs = require('fs');
    const stats = fs.statSync(path);
    expect(stats.size).toBeGreaterThan(0);
    
    // Format-specific validations
    if (conversion.toFormat === 'pdf' || conversion.toFormat === 'pdfa') {
      // Verify PDF header
      const buffer = fs.readFileSync(path);
      const header = buffer.toString('utf8', 0, 4);
      expect(header).toBe('%PDF');
    }
    
    if (conversion.toFormat === 'txt') {
      // Verify text content exists
      const content = fs.readFileSync(path, 'utf8');
      expect(content.length).toBeGreaterThan(0);
    }
    
    if (conversion.toFormat === 'csv') {
      // Verify CSV content contains separators
      const content = fs.readFileSync(path, 'utf8');
      expect(content).toContain(',');
    }
  }
}

// Discover conversions at module level before tests are defined
let allConversions: ConversionEndpoint[] = [];
let availableConversions: ConversionEndpoint[] = [];
let unavailableConversions: ConversionEndpoint[] = [];

// Pre-populate conversions synchronously for test generation
(async () => {
  try {
    availableConversions = await conversionDiscovery.getAvailableConversions();
    unavailableConversions = await conversionDiscovery.getUnavailableConversions();
    allConversions = [...availableConversions, ...unavailableConversions];
  } catch (error) {
    console.error('Failed to discover conversions during module load:', error);
  }
})();

test.describe('Convert Tool E2E Tests', () => {
  
  test.beforeAll(async () => {
    // Re-discover to ensure fresh data at test time
    console.log('Re-discovering available conversion endpoints...');
    availableConversions = await conversionDiscovery.getAvailableConversions();
    unavailableConversions = await conversionDiscovery.getUnavailableConversions();
    
    console.log(`Found ${availableConversions.length} available conversions:`);
    availableConversions.forEach(conv => {
      console.log(`  ✓ ${conv.endpoint}: ${conv.fromFormat} → ${conv.toFormat}`);
    });
    
    if (unavailableConversions.length > 0) {
      console.log(`Found ${unavailableConversions.length} unavailable conversions:`);
      unavailableConversions.forEach(conv => {
        console.log(`  ✗ ${conv.endpoint}: ${conv.fromFormat} → ${conv.toFormat}`);
      });
    }
  });
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the homepage 
    await page.goto(`${BASE_URL}`);
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Wait for the file upload area to appear (shown when no active files)
    await page.waitForSelector('[data-testid="file-dropzone"]', { timeout: 10000 });
  });

  test.describe('Dynamic Conversion Tests', () => {
    
    // Generate a test for each potentially available conversion
    // We'll discover all possible conversions and then skip unavailable ones at runtime
    test('PDF to PNG conversion', async ({ page }) => {
      const conversion = { endpoint: '/api/v1/convert/pdf/img', fromFormat: 'pdf', toFormat: 'png' };
      const isAvailable = availableConversions.some(c => c.apiPath === conversion.endpoint);
      test.skip(!isAvailable, `Endpoint ${conversion.endpoint} is not available`);
      
      const testFile = getTestFileForFormat(conversion.fromFormat);
      await page.setInputFiles('input[type="file"]', testFile);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      await testConversion(page, conversion);
    });

    test('PDF to DOCX conversion', async ({ page }) => {
      const conversion = { endpoint: '/api/v1/convert/pdf/word', fromFormat: 'pdf', toFormat: 'docx' };
      const isAvailable = availableConversions.some(c => c.apiPath === conversion.endpoint);
      test.skip(!isAvailable, `Endpoint ${conversion.endpoint} is not available`);
      
      const testFile = getTestFileForFormat(conversion.fromFormat);
      await page.setInputFiles('input[type="file"]', testFile);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      await testConversion(page, conversion);
    });

    test('DOCX to PDF conversion', async ({ page }) => {
      const conversion = { endpoint: '/api/v1/convert/file/pdf', fromFormat: 'docx', toFormat: 'pdf' };
      const isAvailable = availableConversions.some(c => c.apiPath === conversion.endpoint);
      test.skip(!isAvailable, `Endpoint ${conversion.endpoint} is not available`);
      
      const testFile = getTestFileForFormat(conversion.fromFormat);
      await page.setInputFiles('input[type="file"]', testFile);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      await testConversion(page, conversion);
    });

    test('Image to PDF conversion', async ({ page }) => {
      const conversion = { endpoint: '/api/v1/convert/img/pdf', fromFormat: 'png', toFormat: 'pdf' };
      const isAvailable = availableConversions.some(c => c.apiPath === conversion.endpoint);
      test.skip(!isAvailable, `Endpoint ${conversion.endpoint} is not available`);
      
      const testFile = getTestFileForFormat(conversion.fromFormat);
      await page.setInputFiles('input[type="file"]', testFile);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      await testConversion(page, conversion);
    });

    test('PDF to TXT conversion', async ({ page }) => {
      const conversion = { endpoint: '/api/v1/convert/pdf/text', fromFormat: 'pdf', toFormat: 'txt' };
      const isAvailable = availableConversions.some(c => c.apiPath === conversion.endpoint);
      test.skip(!isAvailable, `Endpoint ${conversion.endpoint} is not available`);
      
      const testFile = getTestFileForFormat(conversion.fromFormat);
      await page.setInputFiles('input[type="file"]', testFile);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      await testConversion(page, conversion);
    });

    test('PDF to HTML conversion', async ({ page }) => {
      const conversion = { endpoint: '/api/v1/convert/pdf/html', fromFormat: 'pdf', toFormat: 'html' };
      const isAvailable = availableConversions.some(c => c.apiPath === conversion.endpoint);
      test.skip(!isAvailable, `Endpoint ${conversion.endpoint} is not available`);
      
      const testFile = getTestFileForFormat(conversion.fromFormat);
      await page.setInputFiles('input[type="file"]', testFile);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      await testConversion(page, conversion);
    });

    test('PDF to XML conversion', async ({ page }) => {
      const conversion = { endpoint: '/api/v1/convert/pdf/xml', fromFormat: 'pdf', toFormat: 'xml' };
      const isAvailable = availableConversions.some(c => c.apiPath === conversion.endpoint);
      test.skip(!isAvailable, `Endpoint ${conversion.endpoint} is not available`);
      
      const testFile = getTestFileForFormat(conversion.fromFormat);
      await page.setInputFiles('input[type="file"]', testFile);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      await testConversion(page, conversion);
    });

    test('PDF to CSV conversion', async ({ page }) => {
      const conversion = { endpoint: '/api/v1/convert/pdf/csv', fromFormat: 'pdf', toFormat: 'csv' };
      const isAvailable = availableConversions.some(c => c.apiPath === conversion.endpoint);
      test.skip(!isAvailable, `Endpoint ${conversion.endpoint} is not available`);
      
      const testFile = getTestFileForFormat(conversion.fromFormat);
      await page.setInputFiles('input[type="file"]', testFile);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      await testConversion(page, conversion);
    });

    test('PDF to PDFA conversion', async ({ page }) => {
      const conversion = { endpoint: '/api/v1/convert/pdf/pdfa', fromFormat: 'pdf', toFormat: 'pdfa' };
      const isAvailable = availableConversions.some(c => c.apiPath === conversion.endpoint);
      test.skip(!isAvailable, `Endpoint ${conversion.endpoint} is not available`);
      
      const testFile = getTestFileForFormat(conversion.fromFormat);
      await page.setInputFiles('input[type="file"]', testFile);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      await testConversion(page, conversion);
    });
  });

  test.describe('Static Tests', () => {
    
    // Test that disabled conversions don't appear in dropdowns when they shouldn't
    test('should not show conversion button when no valid conversions available', async ({ page }) => {
      // This test ensures the convert button is disabled when no valid conversion is possible
      await page.setInputFiles('input[type="file"]', TEST_FILES.pdf);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      // Click the Convert tool button
      await page.click('[data-testid="tool-convert"]');
      
      // Wait for convert mode and select file
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 5000 });
      await page.click('[data-testid="file-thumbnail-checkbox"]');
      
      // Don't select any formats - convert button should not exist
      const convertButton = page.locator('[data-testid="convert-button"]');
      await expect(convertButton).toHaveCount(0);
    });
  });

  test.describe('Error Handling', () => {
    
    test('should handle corrupted file gracefully', async ({ page }) => {
      // Create a corrupted file
      const corruptedPath = resolveTestFixturePath('corrupted.pdf');
      fs.writeFileSync(corruptedPath, 'This is not a valid PDF file');
      
      await page.setInputFiles('input[type="file"]', corruptedPath);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      // Click the Convert tool button
      await page.click('[data-testid="tool-convert"]');
      
      // Wait for convert mode and select file
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 5000 });
      await page.click('[data-testid="file-thumbnail-checkbox"]');
      
      await page.click('[data-testid="convert-from-dropdown"]');
      await page.click('[data-testid="format-option-pdf"]');
      
      await page.click('[data-testid="convert-to-dropdown"]');
      await page.click('[data-testid="format-option-png"]');
      
      await page.click('[data-testid="convert-button"]');
      
      // Should show error message
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      // Error text content will vary based on translation, so just check error message exists
      await expect(page.locator('[data-testid="error-message"]')).not.toBeEmpty();
      
      // Clean up
      fs.unlinkSync(corruptedPath);
    });

    test('should handle backend unavailability', async ({ page }) => {
      // This test would require mocking the backend or testing during downtime
      // For now, we'll simulate by checking error handling UI
      
      await page.setInputFiles('input[type="file"]', TEST_FILES.pdf);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      // Click the Convert tool button
      await page.click('[data-testid="tool-convert"]');
      
      // Wait for convert mode and select file
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 5000 });
      await page.click('[data-testid="file-thumbnail-checkbox"]');
      
      // Mock network failure
      await page.route('**/api/v1/convert/**', route => {
        route.abort('failed');
      });
      
      await page.click('[data-testid="convert-from-dropdown"]');
      await page.click('[data-testid="format-option-pdf"]');
      
      await page.click('[data-testid="convert-to-dropdown"]');
      await page.click('[data-testid="format-option-png"]');
      
      await page.click('[data-testid="convert-button"]');
      
      // Should show network error
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    });
  });

  test.describe('UI/UX Flow', () => {
    
    test('should reset TO dropdown when FROM changes', async ({ page }) => {
      await page.setInputFiles('input[type="file"]', TEST_FILES.pdf);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      // Click the Convert tool button
      await page.click('[data-testid="tool-convert"]');
      
      // Wait for convert mode and select file
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 5000 });
      await page.click('[data-testid="file-thumbnail-checkbox"]');
      
      // Select PDF -> PNG
      await page.click('[data-testid="convert-from-dropdown"]');
      await page.click('[data-testid="format-option-pdf"]');
      
      await page.click('[data-testid="convert-to-dropdown"]');
      await page.click('[data-testid="format-option-png"]');
      
      // Verify PNG is selected
      await expect(page.locator('[data-testid="convert-to-dropdown"]')).toContainText('Image (PNG)');
      
      // Change FROM to DOCX
      await page.click('[data-testid="convert-from-dropdown"]');
      await page.click('[data-testid="format-option-docx"]');
      
      // TO dropdown should reset
      await expect(page.locator('[data-testid="convert-to-dropdown"]')).toContainText('Select target file format');
    });

    test('should show/hide format-specific options correctly', async ({ page }) => {
      await page.setInputFiles('input[type="file"]', TEST_FILES.pdf);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      // Click the Convert tool button
      await page.click('[data-testid="tool-convert"]');
      
      // Wait for convert mode and select file
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 5000 });
      await page.click('[data-testid="file-thumbnail-checkbox"]');
      
      await page.click('[data-testid="convert-from-dropdown"]');
      await page.click('[data-testid="format-option-pdf"]');
      
      // Select image format - should show image options
      await page.click('[data-testid="convert-to-dropdown"]');
      await page.click('[data-testid="format-option-png"]');
      
      await expect(page.locator('[data-testid="image-options-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="dpi-input"]')).toBeVisible();
      
      // Change to CSV format - should hide image options and show CSV options
      await page.click('[data-testid="convert-to-dropdown"]');
      await page.click('[data-testid="format-option-csv"]');
      
      await expect(page.locator('[data-testid="image-options-section"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="dpi-input"]')).not.toBeVisible();
      
      // Should show CSV options
      await expect(page.locator('[data-testid="csv-options-section"]')).toBeVisible();
      await expect(page.locator('[data-testid="page-numbers-input"]')).toBeVisible();
    });

    test('should handle CSV page number input correctly', async ({ page }) => {
      await page.setInputFiles('input[type="file"]', TEST_FILES.pdf);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      // Click the Convert tool button
      await page.click('[data-testid="tool-convert"]');
      
      // Wait for convert mode and select file
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 5000 });
      await page.click('[data-testid="file-thumbnail-checkbox"]');
      
      await page.click('[data-testid="convert-from-dropdown"]');
      await page.click('[data-testid="format-option-pdf"]');
      
      await page.click('[data-testid="convert-to-dropdown"]');
      await page.click('[data-testid="format-option-csv"]');
      
      // Should show CSV options with default value
      await expect(page.locator('[data-testid="page-numbers-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="page-numbers-input"]')).toHaveValue('all');
      
      // Should be able to change page numbers
      await page.fill('[data-testid="page-numbers-input"]', '1,3,5-7');
      await expect(page.locator('[data-testid="page-numbers-input"]')).toHaveValue('1,3,5-7');
      
      // Should show help text
      await expect(page.locator('[data-testid="page-numbers-input"]')).toHaveAttribute('placeholder', /e\.g\.,.*all/);
      
      // Mathematical function should work too
      await page.fill('[data-testid="page-numbers-input"]', '2n+1');
      await expect(page.locator('[data-testid="page-numbers-input"]')).toHaveValue('2n+1');
    });

    test('should show progress indicators during conversion', async ({ page }) => {
      await page.setInputFiles('input[type="file"]', TEST_FILES.pdf);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      // Click the Convert tool button
      await page.click('[data-testid="tool-convert"]');
      
      // Wait for convert mode and select file
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 5000 });
      await page.click('[data-testid="file-thumbnail-checkbox"]');
      
      await page.click('[data-testid="convert-from-dropdown"]');
      await page.click('[data-testid="format-option-pdf"]');
      
      await page.click('[data-testid="convert-to-dropdown"]');
      await page.click('[data-testid="format-option-png"]');
      
      await page.click('[data-testid="convert-button"]');
      
      // Should show loading state (button becomes disabled during loading)
      await expect(page.locator('[data-testid="convert-button"]')).toBeDisabled();
      
      // Wait for completion
      await page.waitForSelector('[data-testid="conversion-results"]', { timeout: 30000 });
      
      // Loading should be gone (button should be enabled again, though it may be collapsed in results view)
      // We check for results instead since the button might be in a collapsed state
      await expect(page.locator('[data-testid="conversion-results"]')).toBeVisible();
    });
  });

  test.describe('File Preview Integration', () => {
    
    test('should integrate with file preview system', async ({ page }) => {
      await page.setInputFiles('input[type="file"]', TEST_FILES.pdf);
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
      
      // Click the Convert tool button
      await page.click('[data-testid="tool-convert"]');
      
      // Wait for convert mode and select file
      await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 5000 });
      await page.click('[data-testid="file-thumbnail-checkbox"]');
      
      await page.click('[data-testid="convert-from-dropdown"]');
      await page.click('[data-testid="format-option-pdf"]');
      
      await page.click('[data-testid="convert-to-dropdown"]');
      await page.click('[data-testid="format-option-png"]');
      
      await page.click('[data-testid="convert-button"]');
      await page.waitForSelector('[data-testid="conversion-results"]', { timeout: 30000 });
      
      // Should show preview of converted file in the results preview container
      await expect(page.locator('[data-testid="results-preview-container"]')).toBeVisible();
      
      // Should show the preview title with file count
      await expect(page.locator('[data-testid="results-preview-title"]')).toBeVisible();
      
      // Should be able to click on result thumbnails to preview (first thumbnail)
      const firstThumbnail = page.locator('[data-testid="results-preview-thumbnail-0"]');
      if (await firstThumbnail.isVisible()) {
        await firstThumbnail.click();
        // After clicking, should switch to viewer mode (this happens through handleThumbnailClick)
        // We can verify this by checking if the current mode changed
        await page.waitForTimeout(500); // Small wait for mode change
      }
    });
  });
});

