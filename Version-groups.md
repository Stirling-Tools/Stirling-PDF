|All versions in a Docker environment can download Calibre as a optional extra at runtime to support `book-to-pdf` and `pdf-to-book` using parameter ``INSTALL_BOOK_AND_ADVANCED_HTML_OPS``.
The 'Fat' container contains all those found in 'Full' with security jar along with this Calibre install. 

Technology | Ultra-Lite | Full  |
| ---------- | :--------: | :---: |
| Java       |     ✔️      |   ✔️   |
| JavaScript |     ✔️      |   ✔️   |
| Libre      |            |   ✔️   |
| Python     |            |   ✔️   |
| OpenCV     |            |   ✔️   |
| OCRmyPDF   |            |   ✔️   |

| Operation              | Ultra-Lite | Full |
| ---------------------- | ---------- | ---- |
| add-page-numbers       | ✔️          | ✔️    |
| add-password           | ✔️          | ✔️    |
| add-image              | ✔️          | ✔️    |
| add-watermark          | ✔️          | ✔️    |
| adjust-contrast        | ✔️          | ✔️    |
| auto-split-pdf         | ✔️          | ✔️    |
| auto-redact            | ✔️          | ✔️    |
| auto-rename            | ✔️          | ✔️    |
| cert-sign              | ✔️          | ✔️    |
| remove-cert-sign       | ✔️          | ✔️    |
| crop                   | ✔️          | ✔️    |
| change-metadata        | ✔️          | ✔️    |
| change-permissions     | ✔️          | ✔️    |
| compare                | ✔️          | ✔️    |
| extract-page           | ✔️          | ✔️    |
| extract-images         | ✔️          | ✔️    |
| flatten                | ✔️          | ✔️    |
| get-info-on-pdf        | ✔️          | ✔️    |
| img-to-pdf             | ✔️          | ✔️    |
| markdown-to-pdf        | ✔️          | ✔️    |
| merge-pdfs             | ✔️          | ✔️    |
| multi-page-layout      | ✔️          | ✔️    |
| overlay-pdf            | ✔️          | ✔️    |
| pdf-organizer          | ✔️          | ✔️    |
| pdf-to-csv             | ✔️          | ✔️    |
| pdf-to-img             | ✔️          | ✔️    |
| pdf-to-single-page     | ✔️          | ✔️    |
| remove-pages           | ✔️          | ✔️    |
| remove-password        | ✔️          | ✔️    |
| rotate-pdf             | ✔️          | ✔️    |
| sanitize-pdf           | ✔️          | ✔️    |
| scale-pages            | ✔️          | ✔️    |
| sign                   | ✔️          | ✔️    |
| show-javascript        | ✔️          | ✔️    |
| split-by-size-or-count | ✔️          | ✔️    |
| split-pdf-by-sections  | ✔️          | ✔️    |
| split-pdfs             | ✔️          | ✔️    |
| compress-pdf           |            | ✔️    |
| extract-image-scans    |            | ✔️    |
| ocr-pdf                |            | ✔️    |
| pdf-to-pdfa            |            | ✔️    |
| remove-blanks          |            | ✔️    |
