/** Icons the landing screen renders, so its first paint does not wait for the registry.
 *
 * The names come from `tests/walkthrough/perf/probe-icons.mjs` and
 * `tests/walkthrough/perf/probe-icons-viewport.mjs`, which record every name
 * `<Icon>` renders while the landing surface is used on desktop and on a
 * 412x915 phone. Both widths are needed: a narrow layout swaps some controls
 * (`settings`, `layout-grid` replace `images`, `upload`), and a name that is
 * registered but not listed here starts the registry fetch. Everything else
 * stays in `icons.ts`, which `Icon.tsx` loads on the first name that is not
 * listed here. `MISSING_ICON` is pinned on top of the recording, because the
 * placeholder a bad name falls back to must paint in that same render.
 * Re-record at both widths when the landing screen starts using a new icon -
 * a name missing from this list still renders, one tick later, at the cost of
 * that one fetch.
 */
import type { ComponentType, SVGProps } from "react";

import AnnotationOff from "@app/icons/svg/stirling/annotation-off.svg?react";
import Automate from "@app/icons/svg/stirling/automate.svg?react";
import Award from "lucide-static/icons/award.svg?react";
import BadgeCheck from "lucide-static/icons/badge-check.svg?react";
import Bell from "lucide-static/icons/bell.svg?react";
import BookOpen from "lucide-static/icons/book-open.svg?react";
import Braces from "lucide-static/icons/braces.svg?react";
import BrushCleaning from "lucide-static/icons/brush-cleaning.svg?react";
import CircleDashed from "lucide-static/icons/circle-dashed.svg?react";
import CircleQuestionMark from "lucide-static/icons/circle-question-mark.svg?react";
import ClipboardCheck from "lucide-static/icons/clipboard-check.svg?react";
import ClipboardList from "lucide-static/icons/clipboard-list.svg?react";
import Clock from "lucide-static/icons/clock.svg?react";
import CopyPlus from "lucide-static/icons/copy-plus.svg?react";
import Crop from "lucide-static/icons/crop.svg?react";
import ExternalLink from "lucide-static/icons/external-link.svg?react";
import FileConvert from "@app/icons/svg/stirling/file-convert.svg?react";
import FileDigit from "lucide-static/icons/file-digit.svg?react";
import FileLockOpen from "@app/icons/svg/stirling/file-lock-open.svg?react";
import FileText from "lucide-static/icons/file-text.svg?react";
import FileUp from "lucide-static/icons/file-up.svg?react";
import FileX from "lucide-static/icons/file-x.svg?react";
import Folder from "lucide-static/icons/folder.svg?react";
import FolderPlus from "lucide-static/icons/folder-plus.svg?react";
import FormInput from "lucide-static/icons/form-input.svg?react";
import FormScan from "@app/icons/svg/stirling/form-scan.svg?react";
import GitBranch from "lucide-static/icons/git-branch.svg?react";
import Image from "lucide-static/icons/image.svg?react";
import ImageCompare from "@app/icons/svg/stirling/image-compare.svg?react";
import Images from "lucide-static/icons/images.svg?react";
import LayersMinus from "lucide-static/icons/layers-minus.svg?react";
import LayoutDashboard from "lucide-static/icons/layout-dashboard.svg?react";
import LayoutGrid from "lucide-static/icons/layout-grid.svg?react";
import Library from "lucide-static/icons/library.svg?react";
import Lock from "lucide-static/icons/lock.svg?react";
import LockOpenPassword from "@app/icons/svg/stirling/lock-open-password.svg?react";
import Maximize2 from "lucide-static/icons/maximize-2.svg?react";
import MoveItemDown from "@app/icons/svg/stirling/move-item-down.svg?react";
import OverlayPages from "@app/icons/svg/stirling/overlay-pages.svg?react";
import PaintBucket from "lucide-static/icons/paint-bucket.svg?react";
import Palette from "lucide-static/icons/palette.svg?react";
import Paperclip from "lucide-static/icons/paperclip.svg?react";
import Password from "@app/icons/svg/stirling/password.svg?react";
import PenTool from "lucide-static/icons/pen-tool.svg?react";
import Pencil from "lucide-static/icons/pencil.svg?react";
import Plus from "lucide-static/icons/plus.svg?react";
import Redact from "@app/icons/svg/stirling/redact.svg?react";
import RemoveSelection from "@app/icons/svg/stirling/remove-selection.svg?react";
import RotateCw from "lucide-static/icons/rotate-cw.svg?react";
import RotateCwSquare from "lucide-static/icons/rotate-cw-square.svg?react";
import Rows3 from "lucide-static/icons/rows-3.svg?react";
import Scan from "lucide-static/icons/scan.svg?react";
import ScanText from "lucide-static/icons/scan-text.svg?react";
import Scissors from "lucide-static/icons/scissors.svg?react";
import Search from "lucide-static/icons/search.svg?react";
import Settings from "lucide-static/icons/settings.svg?react";
import ShieldOff from "lucide-static/icons/shield-off.svg?react";
import Shrink from "lucide-static/icons/shrink.svg?react";
import Signature from "lucide-static/icons/signature.svg?react";
import SinglePage from "@app/icons/svg/stirling/single-page.svg?react";
import SlidersHorizontal from "lucide-static/icons/sliders-horizontal.svg?react";
import SquarePen from "lucide-static/icons/square-pen.svg?react";
import Stamp from "lucide-static/icons/stamp.svg?react";
import Star from "lucide-static/icons/star.svg?react";
import StirlingMark from "@app/icons/svg/stirling/stirling-mark.svg?react";
import TableColumnsSplit from "lucide-static/icons/table-columns-split.svg?react";
import TableOfContents from "lucide-static/icons/table-of-contents.svg?react";
import Trash from "lucide-static/icons/trash.svg?react";
import Type from "lucide-static/icons/type.svg?react";
import Upload from "lucide-static/icons/upload.svg?react";
import Watermark from "@app/icons/svg/stirling/watermark.svg?react";
import WholeWord from "lucide-static/icons/whole-word.svg?react";
import Wrench from "lucide-static/icons/wrench.svg?react";

export type IconEntry = {
  Component: ComponentType<SVGProps<SVGSVGElement>>;
  kind: "lucide" | "stirling" | "brand";
};

export const STARTUP_ICONS = {
  "annotation-off": { Component: AnnotationOff, kind: "stirling" },
  automate: { Component: Automate, kind: "stirling" },
  award: { Component: Award, kind: "lucide" },
  "badge-check": { Component: BadgeCheck, kind: "lucide" },
  bell: { Component: Bell, kind: "lucide" },
  "book-open": { Component: BookOpen, kind: "lucide" },
  braces: { Component: Braces, kind: "lucide" },
  "brush-cleaning": { Component: BrushCleaning, kind: "lucide" },
  "circle-dashed": { Component: CircleDashed, kind: "lucide" },
  "circle-question-mark": { Component: CircleQuestionMark, kind: "lucide" },
  "clipboard-check": { Component: ClipboardCheck, kind: "lucide" },
  "clipboard-list": { Component: ClipboardList, kind: "lucide" },
  clock: { Component: Clock, kind: "lucide" },
  "copy-plus": { Component: CopyPlus, kind: "lucide" },
  crop: { Component: Crop, kind: "lucide" },
  "external-link": { Component: ExternalLink, kind: "lucide" },
  "file-convert": { Component: FileConvert, kind: "stirling" },
  "file-digit": { Component: FileDigit, kind: "lucide" },
  "file-lock-open": { Component: FileLockOpen, kind: "stirling" },
  "file-text": { Component: FileText, kind: "lucide" },
  "file-up": { Component: FileUp, kind: "lucide" },
  "file-x": { Component: FileX, kind: "lucide" },
  folder: { Component: Folder, kind: "lucide" },
  "folder-plus": { Component: FolderPlus, kind: "lucide" },
  "form-input": { Component: FormInput, kind: "lucide" },
  "form-scan": { Component: FormScan, kind: "stirling" },
  "git-branch": { Component: GitBranch, kind: "lucide" },
  image: { Component: Image, kind: "lucide" },
  "image-compare": { Component: ImageCompare, kind: "stirling" },
  images: { Component: Images, kind: "lucide" },
  "layers-minus": { Component: LayersMinus, kind: "lucide" },
  "layout-dashboard": { Component: LayoutDashboard, kind: "lucide" },
  "layout-grid": { Component: LayoutGrid, kind: "lucide" },
  library: { Component: Library, kind: "lucide" },
  lock: { Component: Lock, kind: "lucide" },
  "lock-open-password": { Component: LockOpenPassword, kind: "stirling" },
  "maximize-2": { Component: Maximize2, kind: "lucide" },
  "move-item-down": { Component: MoveItemDown, kind: "stirling" },
  "overlay-pages": { Component: OverlayPages, kind: "stirling" },
  "paint-bucket": { Component: PaintBucket, kind: "lucide" },
  palette: { Component: Palette, kind: "lucide" },
  paperclip: { Component: Paperclip, kind: "lucide" },
  password: { Component: Password, kind: "stirling" },
  "pen-tool": { Component: PenTool, kind: "lucide" },
  pencil: { Component: Pencil, kind: "lucide" },
  plus: { Component: Plus, kind: "lucide" },
  redact: { Component: Redact, kind: "stirling" },
  "remove-selection": { Component: RemoveSelection, kind: "stirling" },
  "rotate-cw": { Component: RotateCw, kind: "lucide" },
  "rotate-cw-square": { Component: RotateCwSquare, kind: "lucide" },
  "rows-3": { Component: Rows3, kind: "lucide" },
  scan: { Component: Scan, kind: "lucide" },
  "scan-text": { Component: ScanText, kind: "lucide" },
  scissors: { Component: Scissors, kind: "lucide" },
  search: { Component: Search, kind: "lucide" },
  settings: { Component: Settings, kind: "lucide" },
  "shield-off": { Component: ShieldOff, kind: "lucide" },
  shrink: { Component: Shrink, kind: "lucide" },
  signature: { Component: Signature, kind: "lucide" },
  "single-page": { Component: SinglePage, kind: "stirling" },
  "sliders-horizontal": { Component: SlidersHorizontal, kind: "lucide" },
  "square-pen": { Component: SquarePen, kind: "lucide" },
  stamp: { Component: Stamp, kind: "lucide" },
  star: { Component: Star, kind: "lucide" },
  "stirling-mark": { Component: StirlingMark, kind: "brand" },
  "table-columns-split": { Component: TableColumnsSplit, kind: "lucide" },
  "table-of-contents": { Component: TableOfContents, kind: "lucide" },
  trash: { Component: Trash, kind: "lucide" },
  type: { Component: Type, kind: "lucide" },
  upload: { Component: Upload, kind: "lucide" },
  watermark: { Component: Watermark, kind: "stirling" },
  "whole-word": { Component: WholeWord, kind: "lucide" },
  wrench: { Component: Wrench, kind: "lucide" },
} as const satisfies Record<string, IconEntry>;

/** The icon a name the map cannot resolve falls back to. Pinned, so it always paints. */
export const PLACEHOLDER_ICON: IconEntry = STARTUP_ICONS["circle-dashed"];

export type StartupIconName = keyof typeof STARTUP_ICONS;
