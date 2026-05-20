# Test Fixtures for Convert Tool Testing

This directory contains sample files for testing the convert tool functionality.

## Required Test Files

To run the full test suite, please add the following test files to this directory:

### 1. sample.pdf
- A small PDF document (1-2 pages)
- Should contain text and ideally a simple table for CSV conversion testing
- Should be under 1MB for fast testing

### 2. sample.docx
- A Microsoft Word document with basic formatting
- Should contain headers, paragraphs, and possibly a table
- Should be under 500KB

### 3. sample.png  
- A small PNG image (e.g., 500x500 pixels)
- Should be a real image, not just a test pattern
- Should be under 100KB

### 3b. sample.jpg
- A small JPG image (same image as PNG, different format)
- Should be under 100KB
- Can be created by converting sample.png to JPG

### 4. sample.md
- A Markdown file with various formatting elements:
  ```markdown
  # Test Document
  
  This is a **test** markdown file.
  
  ## Features
  
  - Lists
  - **Bold text**
  - *Italic text*
  - [Links](https://example.com)
  
  ### Code Block
  
  ```javascript
  console.log('Hello, world!');
  ```
  
  | Column 1 | Column 2 |
  |----------|----------|
  | Data 1   | Data 2   |
  ```

### 5. sample.eml (Optional)
- An email file with headers and body
- Can be exported from any email client
- Should contain some attachments for testing

### 6. sample.html (Optional)
- A simple HTML file with various elements
- Should include text, headings, and basic styling


## File Creation Tips

### Creating a test PDF:
1. Create a document in LibreOffice Writer or Google Docs
2. Add some text, headers, and a simple table
3. Export/Save as PDF

### Creating a test DOCX:
1. Create a document in Microsoft Word or LibreOffice Writer
2. Add formatted content (headers, bold, italic, lists)
3. Save as DOCX format

### Creating a test PNG:
1. Use any image editor or screenshot tool
2. Create a simple image with text or shapes
3. Save as PNG format

### Creating a test EML:
1. In your email client, save an email as .eml format
2. Or create manually with proper headers:
   ```
   From: test@example.com
   To: recipient@example.com
   Subject: Test Email
   Date: Mon, 1 Jan 2024 12:00:00 +0000
   
   This is a test email for conversion testing.
   ```

## Test File Structure

```
frontend/src/tests/test-fixtures/
├── README.md (this file)
├── sample.pdf
├── sample.docx
├── sample.png
├── sample.jpg
├── sample.md
├── sample.eml (optional)
└── sample.html (optional)
```

## Usage in Tests

These files are referenced in the test files:

- `ConvertE2E.spec.ts` - Uses all files for E2E testing
- `ConvertIntegration.test.ts` - Uses files for integration testing
- Manual testing scenarios

## Security Note

These are test files only and should not contain any sensitive information. They will be committed to the repository and used in automated testing.

## File Size Guidelines

- Keep test files small for fast CI/CD pipelines and frontend testing
- PDF files: < 1MB (preferably 100-500KB)
- Image files: < 100KB  
- Text files: < 50KB
- Focus on frontend functionality, not backend performance

## Maintenance

When updating the convert tool with new formats:
1. Add corresponding test files to this directory
2. Update the test files list above
3. Update the test cases to include the new formats