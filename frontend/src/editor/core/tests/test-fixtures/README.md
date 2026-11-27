# Test Fixtures for Convert Tool Testing

This directory contains sample files for testing the convert tool functionality.

## Encrypted annotation fixtures

`encrypted-annotations.pdf` and `encrypted-links.pdf` use `annotation-test` as both the user and owner password. They preserve the comments and links from the corresponding unprotected fixtures. Regenerate them with qpdf:

```sh
qpdf --encrypt annotation-test annotation-test 256 -- annotations_out_of_order.pdf encrypted-annotations.pdf
qpdf --encrypt annotation-test annotation-test 256 -- link-annotations-sample.pdf encrypted-links.pdf
```

## Encrypted portfolio fixture

`portfolio-aes-empty-password.pdf` is a one-page portfolio with two attached text
files (`first.txt`, `second.txt`), AES-128 encrypted with an empty user password
and `owner` as the owner password - the shape Acrobat Sign exports. It is what
`portfolioMembers.test.ts` reads to check that members of a portfolio are listed
without asking for a password. Regenerate it with:

```sh
# portfolio.pdf: a page plus two attached files and a /Collection, e.g. made with
# pdf-lib's PDFDocument.attach() and doc.catalog.set(PDFName.of("Collection"), ...)
qpdf --encrypt "" owner 128 --use-aes=y -- portfolio.pdf portfolio-aes-empty-password.pdf
```
## Restricted encrypted fixture

`encrypted-restricted.pdf` is `sample.pdf` opened by `open-pass` with a different permissions (owner) password, `owner-pass`, and printing, modifying and copying restricted. Opening it does not grant the owner's rights, so the permissions password has to be verified separately. Regenerate it with qpdf:

```sh
qpdf --encrypt open-pass owner-pass 256 --print=none --modify=none --extract=n -- sample.pdf encrypted-restricted.pdf
```

## Signature probe fixtures

`signature-*.pdf` exercise the local signature probe (`utils/pdfiumSignatures.ts`). They were signed by Stirling-PDF's `cert-sign` endpoint with `certs/valid-test.p12` (password `testpass`, signer `Test Signer`):

- `signature-one.pdf`: one signature covering the whole file.
- `signature-two.pdf`: `signature-one.pdf` countersigned, so the first signature no longer reaches the end of the file.
- `signature-changed-after.pdf`: `signature-one.pdf` with an incremental metadata update appended after signing.
- `signature-rewritten.pdf`: `signature-one.pdf` rewritten by `update-metadata`, so its byte range no longer fits the file.
- `signature-timestamp.pdf`: an RFC 3161 document timestamp from `timestamp-pdf` (DigiCert TSA).
- `signature-empty-field.pdf`: an empty signature field with no signature value.

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
frontend/src/editor/core/tests/test-fixtures/
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

## PEM and CRT fixtures

`certs/valid-test-key.pem.txt`, `certs/valid-test-cert.pem.txt` and `certs/valid-test-cert.crt.txt` carry a `.txt` suffix because Vite's dev server refuses to serve `*.pem` and `*.crt` files (`server.fs.deny`), which Storybook and its tests load through. Stories and the Storybook file chooser hand them to panels under their real names.

## One fixture per accepted file type

Storybook offers these files when a file input is clicked (`.storybook/storybookFilePicker.ts`), so every type a tool accepts has at least one real file:

- `sample.odt`, `sample.odp`, `sample.rtf`, `sample.msg` and `sample-html.zip` are copies of `testing/cucumber/exampleFiles/example.*` and `example_html.zip`.
- `certs/valid-test.pfx` and `certs/valid-test.keystore` are copies of `valid-test.p12` and `valid-test.jks` under the extensions the certificate inputs also accept (same password, `testpass`).
- `certs/valid-test-cert.der`, `.crt.txt` and `.cer`, and `certs/valid-test.key`, are the PEM certificate and key in the other encodings those inputs take, so the key and certificate still match:

  ```sh
  openssl x509 -in valid-test-cert.pem.txt -outform der -out valid-test-cert.der
  openssl x509 -in valid-test-cert.pem.txt -outform der -out valid-test-cert.cer
  cp valid-test-cert.pem.txt valid-test-cert.crt.txt
  cp valid-test-key.pem.txt valid-test.key
  ```

- `sample.gif`, `sample.bmp`, `sample.tiff` and `sample.webp` are `sample.png` re-encoded (`sips -s format gif|bmp|tiff`, Pillow for WebP; BMP and TIFF scaled to 200 px wide).
- `bookmarks.json` is the outline the Edit Table of Contents stories import; `automation.json` is a two-step automation in the importer's `{ name, operations }` format; `sample.fb2` is a minimal FictionBook 2 document.
