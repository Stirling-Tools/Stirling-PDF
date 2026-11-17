# Scale pages fixture

`mixed-size-book-scan.pdf` is a synthetic seven-page scan used by
`ScalePagesControllerTest` and the page-normalization walkthrough.

| Page | Displayed size | Rotation | CropBox |
| --- | --- | --- | --- |
| 1 | 595 × 842 | 0° | — |
| 2 | 420 × 900 | 0° | — |
| 3 | 800 × 600 | 0° | — |
| 4 | 600 × 900 | 90° | — |
| 5 | 600 × 900 | 270° | — |
| 6 | 500 × 700 | 0° | 500 × 700 in a 600 × 800 page |
| 7 | 595 × 420 | 0° | — |

Pages 4 and 5 store their scan sideways and rely on `/Rotate`; page 6 models a
scanner bed trimmed by its CropBox. The fixture is intentionally image-free
vector content so it stays small and diffs cleanly.
