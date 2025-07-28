import React from 'react';
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import MergePdfPanel from "../tools/Merge";

export type ToolRegistryEntry = {
    icon: React.ReactNode;
    name: string;
    component: React.ComponentType<any> | null;
    view: string;
    description: string;
    category: string;
    subcategory: string | null;
};

export type ToolRegistry = {
    [key: string]: ToolRegistryEntry;
};

export const baseToolRegistry: ToolRegistry = {
    "add-attachments": { icon: <span className="material-symbols-rounded">attachment</span>, name: "home.attachments.title", component: null, view: "format", description: "home.attachments.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "add-image": { icon: <span className="material-symbols-rounded">image</span>, name: "home.addImage.title", component: null, view: "format", description: "home.addImage.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "add-page-numbers": { icon: <span className="material-symbols-rounded">123</span>, name: "home.add-page-numbers.title", component: null, view: "format", description: "home.add-page-numbers.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "add-password": { icon: <span className="material-symbols-rounded">password</span>, name: "home.addPassword.title", component: null, view: "security", description: "home.addPassword.desc", category: "Standard Tools", subcategory: "Document Security" },
    "add-stamp": { icon: <span className="material-symbols-rounded">approval</span>, name: "home.AddStampRequest.title", component: null, view: "format", description: "home.AddStampRequest.desc", category: "Standard Tools", subcategory: "Document Security" },
    "add-watermark": { icon: <span className="material-symbols-rounded">branding_watermark</span>, name: "home.watermark.title", component: null, view: "format", description: "home.watermark.desc", category: "Standard Tools", subcategory: "Document Security" },
    "adjust-colors-contrast": { icon: <span className="material-symbols-rounded">palette</span>, name: "home.adjust-contrast.title", component: null, view: "format", description: "home.adjust-contrast.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "adjust-page-size-scale": { icon: <span className="material-symbols-rounded">crop_free</span>, name: "home.scalePages.title", component: null, view: "format", description: "home.scalePages.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "auto-rename-pdf-file": { icon: <span className="material-symbols-rounded">match_word</span>, name: "home.auto-rename.title", component: null, view: "format", description: "home.auto-rename.desc", category: "Advanced Tools", subcategory: "Automation" },
    "auto-split-by-size-count": { icon: <span className="material-symbols-rounded">content_cut</span>, name: "home.autoSizeSplitPDF.title", component: null, view: "format", description: "home.autoSizeSplitPDF.desc", category: "Advanced Tools", subcategory: "Automation" },
    "auto-split-pages": { icon: <span className="material-symbols-rounded">split_scene_right</span>, name: "home.autoSplitPDF.title", component: null, view: "format", description: "home.autoSplitPDF.desc", category: "Advanced Tools", subcategory: "Automation" },
    "automate": { icon: <span className="material-symbols-rounded">automation</span>, name: "home.automate.title", component: null, view: "format", description: "home.automate.desc", category: "Advanced Tools", subcategory: "Automation" },
    "certSign": { icon: <span className="material-symbols-rounded">workspace_premium</span>, name: "home.certSign.title", component: null, view: "sign", description: "home.certSign.desc", category: "Standard Tools", subcategory: "Signing" },
    "change-metadata": { icon: <span className="material-symbols-rounded">assignment</span>, name: "home.changeMetadata.title", component: null, view: "format", description: "home.changeMetadata.desc", category: "Standard Tools", subcategory: "Document Review" },
    "change-permissions": { icon: <span className="material-symbols-rounded">admin_panel_settings</span>, name: "home.permissions.title", component: null, view: "security", description: "home.permissions.desc", category: "Standard Tools", subcategory: "Document Review" },
    "compare": { icon: <span className="material-symbols-rounded">compare</span>, name: "home.compare.title", component: null, view: "format", description: "home.compare.desc", category: "Recommended Tools", subcategory: null },
    "compressPdfs": { icon: <span className="material-symbols-rounded">zoom_in_map</span>, name: "home.compressPdfs.title", component: CompressPdfPanel, view: "compress", description: "home.compressPdfs.desc", category: "Recommended Tools", subcategory: null },
    "convert": { icon: <span className="material-symbols-rounded">sync_alt</span>, name: "home.fileToPDF.title", component: null, view: "convert", description: "home.fileToPDF.desc", category: "Recommended Tools", subcategory: null },
    "cropPdf": { icon: <span className="material-symbols-rounded">crop</span>, name: "home.crop.title", component: null, view: "format", description: "home.crop.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "detect-split-scanned-photos": { icon: <span className="material-symbols-rounded">scanner</span>, name: "home.ScannerImageSplit.title", component: null, view: "format", description: "home.ScannerImageSplit.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "edit-table-of-contents": { icon: <span className="material-symbols-rounded">bookmark_add</span>, name: "home.editTableOfContents.title", component: null, view: "format", description: "home.editTableOfContents.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "extract-images": { icon: <span className="material-symbols-rounded">filter</span>, name: "home.extractImages.title", component: null, view: "extract", description: "home.extractImages.desc", category: "Standard Tools", subcategory: "Extraction" },
    "extract-pages": { icon: <span className="material-symbols-rounded">upload</span>, name: "home.extractPage.title", component: null, view: "extract", description: "home.extractPage.desc", category: "Standard Tools", subcategory: "Extraction" },
    "flatten": { icon: <span className="material-symbols-rounded">layers_clear</span>, name: "home.flatten.title", component: null, view: "format", description: "home.flatten.desc", category: "Standard Tools", subcategory: "Document Security" },
    "get-all-info-on-pdf": { icon: <span className="material-symbols-rounded">fact_check</span>, name: "home.getPdfInfo.title", component: null, view: "extract", description: "home.getPdfInfo.desc", category: "Standard Tools", subcategory: "Verification" },
    "manage-certificates": { icon: <span className="material-symbols-rounded">license</span>, name: "home.manageCertificates.title", component: null, view: "security", description: "home.manageCertificates.desc", category: "Standard Tools", subcategory: "Document Security" },
    "mergePdfs": { icon: <span className="material-symbols-rounded">library_add</span>, name: "home.merge.title", component: MergePdfPanel, view: "merge", description: "home.merge.desc", category: "Recommended Tools", subcategory: null },
    "multi-page-layout": { icon: <span className="material-symbols-rounded">dashboard</span>, name: "home.pageLayout.title", component: null, view: "format", description: "home.pageLayout.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "multi-tool": { icon: <span className="material-symbols-rounded">dashboard_customize</span>, name: "home.multiTool.title", component: null, view: "pageEditor", description: "home.multiTool.desc", category: "Recommended Tools", subcategory: null },
    "ocr": { icon: <span className="material-symbols-rounded">quick_reference_all</span>, name: "home.ocr.title", component: null, view: "convert", description: "home.ocr.desc", category: "Recommended Tools", subcategory: null },
    "overlay-pdfs": { icon: <span className="material-symbols-rounded">layers</span>, name: "home.overlay-pdfs.title", component: null, view: "format", description: "home.overlay-pdfs.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "read": { icon: <span className="material-symbols-rounded">article</span>, name: "home.read.title", component: null, view: "view", description: "home.read.desc", category: "Standard Tools", subcategory: "Document Review" },
    "redact": { icon: <span className="material-symbols-rounded">visibility_off</span>, name: "home.redact.title", component: null, view: "redact", description: "home.redact.desc", category: "Recommended Tools", subcategory: null },
    "remove": { icon: <span className="material-symbols-rounded">delete</span>, name: "home.removePages.title", component: null, view: "remove", description: "home.removePages.desc", category: "Standard Tools", subcategory: "Removal" },
    "remove-annotations": { icon: <span className="material-symbols-rounded">thread_unread</span>, name: "home.removeAnnotations.title", component: null, view: "remove", description: "home.removeAnnotations.desc", category: "Standard Tools", subcategory: "Removal" },
    "remove-blank-pages": { icon: <span className="material-symbols-rounded">scan_delete</span>, name: "home.removeBlanks.title", component: null, view: "remove", description: "home.removeBlanks.desc", category: "Standard Tools", subcategory: "Removal" },
    "remove-certificate-sign": { icon: <span className="material-symbols-rounded">remove_moderator</span>, name: "home.removeCertSign.title", component: null, view: "security", description: "home.removeCertSign.desc", category: "Standard Tools", subcategory: "Removal" },
    "remove-image": { icon: <span className="material-symbols-rounded">remove_selection</span>, name: "home.removeImagePdf.title", component: null, view: "format", description: "home.removeImagePdf.desc", category: "Standard Tools", subcategory: "Removal" },
    "remove-password": { icon: <span className="material-symbols-rounded">lock_open_right</span>, name: "home.removePassword.title", component: null, view: "security", description: "home.removePassword.desc", category: "Standard Tools", subcategory: "Removal" },
    "repair": { icon: <span className="material-symbols-rounded">build</span>, name: "home.repair.title", component: null, view: "format", description: "home.repair.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "replace-and-invert-color": { icon: <span className="material-symbols-rounded">format_color_fill</span>, name: "home.replaceColorPdf.title", component: null, view: "format", description: "home.replaceColorPdf.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "reorganize-pages": { icon: <span className="material-symbols-rounded">move_down</span>, name: "home.reorganizePages.title", component: null, view: "pageEditor", description: "home.reorganizePages.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "rotate": { icon: <span className="material-symbols-rounded">rotate_right</span>, name: "home.rotate.title", component: null, view: "format", description: "home.rotate.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "sanitize": { icon: <span className="material-symbols-rounded">sanitizer</span>, name: "home.sanitizePdf.title", component: null, view: "security", description: "home.sanitizePdf.desc", category: "Standard Tools", subcategory: "Document Security" },
    "scanner-effect": { icon: <span className="material-symbols-rounded">scanner</span>, name: "home.fakeScan.title", component: null, view: "format", description: "home.fakeScan.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "show-javascript": { icon: <span className="material-symbols-rounded">javascript</span>, name: "home.showJS.title", component: null, view: "extract", description: "home.showJS.desc", category: "Advanced Tools", subcategory: "Developer Tools" },
    "sign": { icon: <span className="material-symbols-rounded">signature</span>, name: "home.sign.title", component: null, view: "sign", description: "home.sign.desc", category: "Standard Tools", subcategory: "Signing" },
    "single-large-page": { icon: <span className="material-symbols-rounded">looks_one</span>, name: "home.PdfToSinglePage.title", component: null, view: "format", description: "home.PdfToSinglePage.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "split": { icon: <span className="material-symbols-rounded">content_cut</span>, name: "home.split.title", component: null, view: "format", description: "home.split.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "split-by-chapters": { icon: <span className="material-symbols-rounded">collections_bookmark</span>, name: "home.splitPdfByChapters.title", component: null, view: "format", description: "home.splitPdfByChapters.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "split-by-sections": { icon: <span className="material-symbols-rounded">grid_on</span>, name: "home.split-by-sections.title", component: null, view: "format", description: "home.split-by-sections.desc", category: "Advanced Tools", subcategory: "Advanced Formatting" },
    "splitPdf": { icon: <span className="material-symbols-rounded">content_cut</span>, name: "home.split.title", component: SplitPdfPanel, view: "split", description: "home.split.desc", category: "Standard Tools", subcategory: "Page Formatting" },
    "unlock-pdf-forms": { icon: <span className="material-symbols-rounded">preview_off</span>, name: "home.unlockPDFForms.title", component: null, view: "security", description: "home.unlockPDFForms.desc", category: "Standard Tools", subcategory: "Document Security" },
    "validate-pdf-signature": { icon: <span className="material-symbols-rounded">verified</span>, name: "home.validateSignature.title", component: null, view: "security", description: "home.validateSignature.desc", category: "Standard Tools", subcategory: "Verification" },
    "view-pdf": { icon: <span className="material-symbols-rounded">article</span>, name: "home.viewPdf.title", component: null, view: "view", description: "home.viewPdf.desc", category: "Recommended Tools", subcategory: null
    }
};

export const toolEndpoints: Record<string, string[]> = {
    split: ["split-pages", "split-pdf-by-sections", "split-by-size-or-count", "split-pdf-by-chapters"],
    compressPdfs: ["compress-pdf"],
    merge: ["merge-pdfs"],
    // Add more endpoint mappings as needed
};