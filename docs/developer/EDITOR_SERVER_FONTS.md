# Server fonts for the PDF text editor

Admins drop `.ttf` / `.otf` files into the existing custom fonts folder. Every user of the PDF
text editor sees them in the font picker under "Server fonts", and picking one embeds the real
face into the saved PDF.

## For operators

Folder: `customFiles/static/fonts/` (the same folder the Sign tool already reads). Sub-folders up
to four levels deep are scanned, so a family can live in its own directory.

```yaml
# docker compose
volumes:
  - ./fonts:/configs/customFiles/static/fonts:ro
```

- New, changed or removed files are picked up within 30 seconds. No restart.
- Only TrueType-outline fonts are listed. These are skipped and logged:
  - `.woff` / `.woff2` (PDFium cannot embed them; the Sign tool still uses them)
  - `.ttc` collections
  - CFF-flavoured `.otf` (PostScript outlines cannot be embedded as TrueType)
  - fonts whose OS/2 `fsType` forbids embedding (restricted licence, or bitmap-only)
  - files over 64 MB, and anything FontBox cannot parse
- Files in this folder are also served publicly at `/fonts/<name>`, as they were before this
  feature. Do not put fonts there whose licence forbids that.
- The whole font file is embedded, not a subset, so a 10 MB font adds 10 MB to every PDF that
  uses it.

### Several nodes

Each face's id is the SHA-256 of its file, so any node holding the same file serves the same id.
There is no shared state and no session affinity; every node only needs to see the same folder
contents:

| Deployment | How to provide the folder |
| --- | --- |
| Docker / compose, one or more replicas on one host | Bind mount the folder on every replica. |
| Kubernetes | A `ReadOnlyMany` / `ReadWriteMany` volume (EFS, Azure Files, Filestore, NFS) mounted on every pod, or an init container that copies a fonts archive into an `emptyDir`. A ConfigMap is not suitable (1 MiB limit). |
| Custom image | `COPY fonts/ /configs/customFiles/static/fonts/` |

If nodes disagree (a rolling deploy, a volume not yet mounted), a browser can get the font list
from one node and ask another for a face it lacks. That node answers 404, the browser retries
once, and if the face is still missing the picker says so and leaves the text unchanged.

## How it works

Backend (`app/core`):

- `EditorFontRegistry` walks the folder, parses each file with FontBox for family (name ID 16,
  falling back to 1), style (17, falling back to 2), weight and italic flags, applies the skip
  rules above, and hashes the file. Results are cached by path, size and mtime, so a rescan only
  re-parses changed files.
- `EditorFontController`, behind normal `/api/v1` auth:
  - `GET /api/v1/ui-data/editor-fonts` returns the font list, revalidated by ETag
    (`Cache-Control: no-cache, private`).
  - `GET /api/v1/ui-data/editor-fonts/{sha256}` returns one face, immutable for a year. The id
    is looked up in the registry, never joined onto a path.

Frontend (`frontend/src/editor/core/tools/pdfTextEditor/util`):

- `serverFonts.ts` fetches the font list and individual faces through `apiClient`, and
  registers each downloaded face with `document.fonts` so the edit overlay draws the same glyphs
  the PDF embeds.
- `externalFonts.ts` merges server and device fonts (server wins on a shared family name) and
  is what embedding (`deviceFontEmbed.ts`) and italic capability (`fontCapability.ts`) read.

What is fetched when:

| Request | When |
| --- | --- |
| Font list | First text selection, or first time the font picker opens. Not fetched for users who never edit text. |
| A face | Only when the user picks that family, or toggles italic onto a cut of it. One face per pick. |
| Repeat opens | Served from the browser's HTTP cache. |

If the document already uses a family the server provides, its face is downloaded once the font
list is loaded, so that typing a character the document's embedded subset lacks completes from
the real face instead of falling back to Helvetica.
