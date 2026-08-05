# PDF Elite

A professional, open-source desktop PDF editor inspired by industry-leading software like PDFelement. Built for users who demand precision, performance, and privacy in their PDF workflow.

![PDF Elite Banner](./docs/images/banner.png)

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/pdf-elite/pdf-elite)](https://github.com/pdf-elite/pdf-elite/releases)
[![Downloads](https://img.shields.io/github/downloads/pdf-elite/pdf-elite/total)](https://github.com/pdf-elite/pdf-elite/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/pdf-elite/pdf-elite/releases)

## 📖 Project Overview

PDF Elite is a comprehensive desktop PDF editor that combines professional-grade editing capabilities with an intuitive user interface. Unlike cloud-based solutions, PDF Elite runs entirely on your machine, ensuring your documents never leave your device.

Built on a modern technology stack, PDF Elite delivers:
- **Native Performance**: Fast, responsive UI powered by React and Tauri
- **Privacy First**: All processing happens locally on your device
- **Cross-Platform**: Works seamlessly on Windows, macOS, and Linux
- **Open Source**: Transparent development with community contributions welcome

## ✨ Key Features

### 📝 Editing & Modification

#### Professional Text Editing
- Edit existing text with full font preservation
- Add new text with customizable fonts, sizes, and colors
- Advanced text formatting (bold, italic, underline, strikethrough)
- Character spacing, rotation, and opacity controls
- Multi-line paragraph support with alignment options
- Unicode and embedded font support

#### Image Editing
- Insert images from your computer
- Replace existing images in PDFs
- Extract all images or selected images
- Remove unwanted images
- Resize, crop, rotate, and flip images
- Lock aspect ratio for proportional scaling
- Image overlay and watermarking

#### Hyperlinks
- Add URL links to text or areas
- Create email links (mailto:)
- Link to specific pages within the document
- Link to external files
- Edit and delete existing hyperlinks
- Visual link indicators

#### Watermarks
- Add text watermarks with customizable fonts and opacity
- Add image watermarks with positioning control
- Apply watermarks to single or multiple pages
- Diagonal, horizontal, or custom angle placement
- Layer control (foreground/background)

#### Headers & Footers
- Add page numbers with customizable format
- Insert total page count
- Add date and time stamps
- Include filename, document title, or author
- Custom text variables
- Different first page or odd/even pages
- Precise positioning controls

### 📄 Page Management

#### Merge
- Combine multiple PDFs into one document
- Drag-and-drop file ordering
- Preview before merging
- Preserve bookmarks and metadata

#### Split
- Split by page ranges
- Split by bookmarks
- Extract all pages as separate files
- Custom split intervals

#### Insert Pages
- Insert blank pages at any position
- Insert pages from other PDFs
- Choose paper size and orientation
- Multiple insertion points

#### Delete Pages
- Remove single or multiple pages
- Batch deletion with preview
- Undo support for accidental deletions

#### Replace Pages
- Replace specific pages with new content
- Maintain document structure
- Preview before applying changes

#### Duplicate Pages
- Clone single or multiple pages
- Insert duplicates at any position
- Quick duplication for templates

#### Extract Pages
- Extract selected pages to new PDF
- Preserve or remove links and annotations
- Batch extraction support

#### Rotate Pages
- Rotate individual pages or entire document
- 90°, 180°, 270° rotations
- Auto-rotate scanned documents
- Preview rotation before applying

### 🎨 Annotation

#### Highlight
- Text highlighting with customizable colors
- Adjustable opacity
- Persistent annotations

#### Underline
- Text underlining with color options
- Variable line thickness
- Dashed or solid styles

#### Strikeout
- Text strikeout for redactions
- Customizable appearance
- Comment attachment support

#### Sticky Notes
- Add comments to any location
- Color-coded notes
- Collapse/expand for clean view
- Export comments to summary

#### Shapes
- Rectangles and squares
- Circles and ellipses
- Lines and arrows
- Polylines and polygons
- Customizable stroke and fill

#### Drawing
- Freehand ink annotations
- Highlighter tool with transparency
- Pressure-sensitive stylus support
- Smooth curve rendering

#### Comments
- Threaded comment discussions
- Reply to annotations
- Comment sidebar with filters
- Export comments to PDF summary

### 🖥️ Workspace

#### Multiple Documents
- Open multiple PDFs simultaneously
- Independent editing sessions
- Cross-document operations (merge, copy pages)

#### Tabbed Interface
- Browser-style tab management
- Drag tabs to reorder
- Close, duplicate, or move tabs
- Recent documents quick access

#### Reading Modes
- **Dark Mode**: Easy on the eyes for night reading
- **Sepia Mode**: Warm tone for extended reading sessions
- **Custom Background**: Choose your preferred page background color
- **Color Inversion**: Invert colors for accessibility
- **Full-Screen Mode**: Distraction-free reading
- **Continuous Scroll**: Seamless page navigation
- **Two-Page View**: Side-by-side page display

#### Toolbar Customization
- Show/hide tool categories
- Rearrange tool order
- Favorite tools quick access
- Keyboard shortcut customization
- Compact or expanded toolbar modes

### 🖼️ Image Editing

Advanced image manipulation directly within PDFs:
- Replace images while maintaining layout
- Extract images in original quality
- Remove images without leaving artifacts
- Resize with aspect ratio lock
- Crop to selection
- Rotate and flip horizontally/vertically
- Adjust brightness, contrast, and saturation
- Apply filters and effects

### ⌨️ Professional Text Editing

Industry-leading text editing capabilities:
- **True Text Editing**: Modify existing text without reflow
- **Font Matching**: Automatic font detection and matching
- **Format Painter**: Copy formatting between text elements
- **Find & Replace**: Advanced search with regex support
- **Text Flow**: Intelligent text reflow for paragraphs
- **Embedded Fonts**: Support for custom and embedded fonts
- **Unicode Support**: Full international character set
- **Text Boxes**: Floating text containers with borders

## 🏗️ Architecture

PDF Elite follows a modern, modular architecture designed for performance and extensibility:

```
┌─────────────────────────────────────────────────────────┐
│                    Desktop Application                   │
│                      (Tauri + React)                     │
├─────────────────────────────────────────────────────────┤
│  Frontend Layer                                          │
│  ├── React 19 + TypeScript                              │
│  ├── Mantine UI Components                              │
│  ├── PDF.js Rendering Engine                            │
│  ├── PDF-LIB for Client-Side Operations                 │
│  └── IndexedDB Local Storage                            │
├─────────────────────────────────────────────────────────┤
│  Backend Layer (Optional for Advanced Features)         │
│  ├── Spring Boot API                                    │
│  ├── Apache PDFBox Core                                 │
│  ├── LibreOffice Integration                            │
│  └── qpdf Operations                                    │
├─────────────────────────────────────────────────────────┤
│  Data Layer                                              │
│  ├── Local File System                                  │
│  ├── Session Management                                 │
│  └── Preferences & Settings                             │
└─────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Local-First**: All core operations run on your device
2. **Progressive Enhancement**: Basic features work without backend
3. **Modular Design**: Tools are independent and composable
4. **Type Safety**: Full TypeScript coverage for reliability
5. **Accessibility**: WCAG 2.1 AA compliant interface

## 🛠️ Technology Stack

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Mantine v8
- **Styling**: TailwindCSS
- **PDF Rendering**: PDF.js
- **PDF Manipulation**: PDF-LIB
- **State Management**: React Context + Hooks
- **Internationalization**: i18next (40+ languages)
- **Icons**: Custom icon set + Lucide React

### Backend (Optional)
- **Runtime**: Java 25 (default toolchain; build with `-PjavaVersion=21` to opt into 21)
- **Framework**: Spring Boot 4.0.6
- **PDF Engine**: Apache PDFBox 3.0.0
- **Office Integration**: LibreOffice 7.x
- **PDF Utilities**: qpdf, Tesseract OCR
- **Build Tool**: Gradle 8.x

### Desktop
- **Framework**: Tauri v2
- **WebView**: System native (WebKit/Chromium)
- **Packaging**: Native installers for all platforms

### Development
- **Package Manager**: npm / pnpm
- **Python Tools**: uv (for AI features)
- **Testing**: Vitest, pytest, Cucumber
- **Documentation**: Storybook, JSDoc

## 📁 Project Structure

```
pdf-elite/
├── frontend/editor/          # React-based PDF editor
│   ├── src/
│   │   ├── core/            # Core application logic
│   │   │   ├── tools/       # Individual tool implementations
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── components/  # Reusable UI components
│   │   │   ├── constants/   # App-wide constants
│   │   │   └── utils/       # Utility functions
│   │   ├── workbench/       # Main workspace component
│   │   └── App.tsx          # Application entry point
│   ├── public/              # Static assets
│   └── package.json         # Frontend dependencies
│
├── app/                      # Spring Boot backend
│   ├── core/                # Open-source core module
│   │   ├── src/main/java/
│   │   │   └── stirling/software/SPDF/
│   │   │       ├── controller/api/  # REST controllers
│   │   │       ├── service/         # Business logic
│   │   │       ├── model/           # Data models
│   │   │       └── config/          # Configuration
│   │   └── src/main/resources/      # Static resources
│   ├── proprietary/         # Enterprise features (optional)
│   └── build.gradle.kts     # Build configuration
│
├── engine/                   # AI-powered features (optional)
│   ├── main.py              # FastAPI entry point
│   ├── agents/              # Pydantic-AI agents
│   └── rag/                 # RAG implementation
│
├── docs/                     # Documentation
│   ├── images/              # Screenshots and diagrams
│   └── guides/              # User guides
│
├── README.md                 # This file
├── LICENSE                   # Apache 2.0 License
└── Taskfile.yml              # Task runner configuration
```

## 🗺️ Roadmap

### Version 1.0 (Current)
- ✅ Professional text editing
- ✅ Image management
- ✅ Page organization tools
- ✅ Annotation system
- ✅ Tabbed workspace
- ✅ Reading modes

### Version 1.1 (Q1 2026)
- [ ] Advanced hyperlink management
- [ ] Complete headers & footers system
- [ ] Form filling and creation
- [ ] Digital signatures
- [ ] Batch processing
- [ ] Plugin architecture

### Version 1.2 (Q2 2026)
- [ ] AI-powered features (optional)
  - Document Q&A
  - Automated review
  - Smart form filling
- [ ] Cloud sync (optional)
- [ ] Mobile companion app
- [ ] Real-time collaboration

### Future Considerations
- [ ] Advanced OCR with layout preservation
- [ ] PDF/A conversion
- [ ] Redaction tools
- [ ] Comparison mode
- [ ] Automation pipelines

## 📸 Screenshots

### Editor Interface
![Editor Interface](./docs/images/editor.png)
*Professional editing tools with intuitive interface*

### Text Editing
![Text Editing](./docs/images/text-editing.png)
*Edit existing text with full formatting control*

### Annotation Tools
![Annotation Tools](./docs/images/annotations.png)
*Comprehensive annotation and commenting system*

### Page Management
![Page Management](./docs/images/pages.png)
*Visual page organizer with drag-and-drop*

### Dark Mode
![Dark Mode](./docs/images/dark-mode.png)
*Comfortable reading in low-light environments*

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Ways to Contribute
- **Report Bugs**: Found an issue? [Open an issue](https://github.com/pdf-elite/pdf-elite/issues)
- **Request Features**: Have an idea? [Submit a feature request](https://github.com/pdf-elite/pdf-elite/issues)
- **Improve Documentation**: Help us clarify and expand docs
- **Submit Code**: Fix bugs or add new features via pull requests
- **Translate**: Help localize PDF Elite to more languages

### Development Setup

> ⚠️ PDF Elite ships as a **native desktop application**, not a browser-based
> tool. `task dev` (below) starts the Spring Boot API on `:8080` and opens the
> React UI in a browser tab at `:5173` — that combination is a **frontend
> development convenience only** (fast hot-reload while editing UI code). It
> is never what end users run, and it is not what produces `PDF Elite.exe`.
> For the real desktop app, use the `task desktop:*` commands in the next
> section.

1. **Clone the repository**
   ```bash
   git clone https://github.com/sayedalve/PDF-Elite.git
   cd PDF-Elite
   ```

2. **Install all dependencies** (frontend + backend prerequisites)
   ```bash
   task install
   ```

3. **Start the web dev server** (browser-based UI hot-reload, for frontend work only)
   ```bash
   task dev
   ```

4. **Start the actual desktop app in dev mode** (native window, no browser — see below)
   ```bash
   task desktop:dev
   ```

For detailed contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

### 🖥️ Building the Windows Desktop App (`PDF Elite.exe`)

The desktop shell already exists at `frontend/editor/src-tauri` (Tauri v2). It
bundles a trimmed JRE and the backend jar as resources, launches the Java
backend as an internal background process on a random local port the moment
the app opens, and renders the editor in a native OS window — the user never
sees a browser, a URL bar, or an API landing page.

1. **Dev mode** — native window, live-reloads the frontend, backend auto-starts internally:
   ```bash
   task desktop:dev
   ```

2. **Production build** — produces a signed-ready Windows installer (NSIS) that installs and launches as `PDF Elite.exe`:
   ```bash
   task desktop:build:dev:windows
   ```
   Or, for the full release build across all bundle targets (MSI + auto-updater artifacts once you've configured your own updater signing key — see `tauri.conf.json`):
   ```bash
   task desktop:build
   ```

Output installer lands under `frontend/editor/src-tauri/target/release/bundle/`.
Running it installs and launches **PDF Elite** as a normal Windows program —
no terminal, no localhost, no browser involved at any point.

### Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) to maintain a welcoming and inclusive community.

## 📄 License

PDF Elite is licensed under the [Apache License 2.0](LICENSE).

```
Copyright 2025 PDF Elite Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

## 🙏 Acknowledgments

PDF Elite builds upon excellent open-source projects:
- [Apache PDFBox](https://pdfbox.apache.org/) - PDF manipulation library
- [PDF.js](https://mozilla.github.io/pdf.js/) - PDF rendering engine
- [PDF-LIB](https://pdf-lib.js.org/) - Client-side PDF creation/modification
- [Mantine](https://mantine.dev/) - Modern React component library
- [Tauri](https://tauri.app/) - Desktop application framework
- [Spring Boot](https://spring.io/projects/spring-boot) - Backend framework

## 📞 Support

- **Documentation**: [View Docs](https://pdf-elite.github.io/docs)
- **Issues**: [Report Issues](https://github.com/pdf-elite/pdf-elite/issues)
- **Discussions**: [Join Discussions](https://github.com/pdf-elite/pdf-elite/discussions)
- **Email**: support@pdf-elite.app

---

<p align="center">
  <strong>PDF Elite</strong> — Professional PDF editing, made accessible.
</p>
