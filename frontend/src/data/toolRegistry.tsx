import React from 'react';
import { useTranslation } from 'react-i18next';
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import OCRPanel from '../tools/OCR';
import ConvertPanel from '../tools/Convert';
import Sanitize from '../tools/Sanitize';
import AddPassword from '../tools/AddPassword';
import ChangePermissions from '../tools/ChangePermissions';
import RemovePassword from '../tools/RemovePassword';

// Category and subcategory enums for type safety
export enum ToolCategory {
    STANDARD_TOOLS = 'Standard Tools',
    ADVANCED_TOOLS = 'Advanced Tools',
    RECOMMENDED_TOOLS = 'Recommended Tools'
}

export enum ToolSubcategory {
    SIGNING = 'Signing',
    DOCUMENT_SECURITY = 'Document Security',
    VERIFICATION = 'Verification',
    DOCUMENT_REVIEW = 'Document Review',
    PAGE_FORMATTING = 'Page Formatting',
    EXTRACTION = 'Extraction',
    REMOVAL = 'Removal',
    AUTOMATION = 'Automation',
    GENERAL = 'General',
    ADVANCED_FORMATTING = 'Advanced Formatting',
    DEVELOPER_TOOLS = 'Developer Tools'
}

export type ToolRegistryEntry = {
    icon: React.ReactNode;
    name: string;
    component: React.ComponentType<any> | null;
    view: 'sign' | 'security' | 'format' | 'extract' | 'view' | 'merge' | 'pageEditor' | 'convert' | 'redact' | 'split' | 'convert' | 'remove' | 'compress' | 'external';
    description: string;
    category: ToolCategory;
    subcategory: ToolSubcategory;
    
    // Optional custom props for tools
    maxFiles?: number; 
    supportedFormats?: string[];
    endpoints?: string[]; 
    
    // Optional key to distinguish between regular tools and links
    link?: string;
    type?: string;
};

export type ToolRegistry = {
    [key: string]: ToolRegistryEntry;
};

/**
 * Tool Registry
 * 
 * This file contains the main tool registry for the application.
 * 
 * Structure:
 * - useFlatToolRegistry: Hook that returns Record<string, ToolRegistryEntry> with translations
 * 
 * The registry is organized by categories and subcategories:
 * - Standard Tools: Signing, Document Security, Verification, Document Review, Page Formatting, Document Assembly, Extraction, Removal
 * - Advanced Tools: Automation, Advanced Formatting, Developer Tools
 * - Recommended Tools: Quick access tools
 */
// Ordered list used elsewhere for display ordering
// Subcategory display order (top to bottom, left to right)
export const SUBCATEGORY_ORDER: ToolSubcategory[] = [
    ToolSubcategory.SIGNING,
    ToolSubcategory.DOCUMENT_SECURITY,
    ToolSubcategory.VERIFICATION,
    ToolSubcategory.DOCUMENT_REVIEW,
    ToolSubcategory.PAGE_FORMATTING,
    ToolSubcategory.EXTRACTION,
    ToolSubcategory.REMOVAL,
    ToolSubcategory.AUTOMATION,
    ToolSubcategory.GENERAL,
    ToolSubcategory.ADVANCED_FORMATTING,
    ToolSubcategory.DEVELOPER_TOOLS,
];

// Color coding for subcategories (loosely resembling the v1 color palette)
export const SUBCATEGORY_COLOR_MAP: Record<ToolSubcategory, string> = {
    // Security & Signing (pink)
    [ToolSubcategory.SIGNING]: '#FF7892',
    [ToolSubcategory.DOCUMENT_SECURITY]: '#FF7892',
    // Review / Verification (blue-green)
    [ToolSubcategory.VERIFICATION]: '#1BB1D4',
    [ToolSubcategory.DOCUMENT_REVIEW]: '#48BD54',
    // Organize / Page operations (purple/organize + blue accents)
    [ToolSubcategory.PAGE_FORMATTING]: '#7882FF',
    [ToolSubcategory.REMOVAL]: '#7882FF',
    [ToolSubcategory.EXTRACTION]: '#1BB1D4',
    // Automation / General quick actions (green)
    [ToolSubcategory.AUTOMATION]: '#69DC95',
    [ToolSubcategory.GENERAL]: '#69DC95',
    // Advanced buckets (red family)
    [ToolSubcategory.ADVANCED_FORMATTING]: '#F55454',
    [ToolSubcategory.DEVELOPER_TOOLS]: '#F55454',
};

export const getSubcategoryColor = (subcategory: ToolSubcategory): string => {
    return SUBCATEGORY_COLOR_MAP[subcategory] || '#7882FF';
};



// Hook to get the translated tool registry
export function useFlatToolRegistry(): ToolRegistry {
    const { t } = useTranslation();
    
    return {
    
    
    // Signing

    "certSign": {
        icon: <span className="material-symbols-rounded">workspace_premium</span>,
        name: t("home.certSign.title", "Sign with Certificate"),
        component: null,
        view: "sign",
        description: t("home.certSign.desc", "Signs a PDF with a Certificate/Key (PEM/P12)"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.SIGNING
    },
    "sign": {
        icon: <span className="material-symbols-rounded">signature</span>,
        name: t("home.sign.title", "Sign"),
        component: null,
        view: "sign",
        description: t("home.sign.desc", "Adds signature to PDF by drawing, text or image"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.SIGNING
    },


    // Document Security

    "addPassword": {
        icon: <span className="material-symbols-rounded">password</span>,
        name: t("home.addPassword.title", "Add Password"),
        component: AddPassword,
        view: "security",
        description: t("home.addPassword.desc", "Add password protection and restrictions to PDF files"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["add-password"]
    },
    "add-watermark": {
        icon: <span className="material-symbols-rounded">branding_watermark</span>,
        name: t("home.watermark.title", "Add Watermark"),
        component: null,
        view: "format",
        description: t("home.watermark.desc", "Add a custom watermark to your PDF document."),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_SECURITY
    },
    "add-stamp": {
        icon: <span className="material-symbols-rounded">approval</span>,
        name: t("home.AddStampRequest.title", "Add Stamp to PDF"),
        component: null,
        view: "format",
        description: t("home.AddStampRequest.desc", "Add text or add image stamps at set locations"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_SECURITY
    },
    "sanitize": {
        icon: <span className="material-symbols-rounded">cleaning_services</span>,
        name: t("home.sanitize.title", "Sanitize"),
        component: Sanitize,
        view: "security",
        maxFiles: -1,
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_SECURITY,
        description: t("home.sanitize.desc", "Remove potentially harmful elements from PDF files"),
        endpoints: ["sanitize-pdf"]
    },
    "flatten": {
        icon: <span className="material-symbols-rounded">layers_clear</span>,
        name: t("home.flatten.title", "Flatten"),
        component: null,
        view: "format",
        description: t("home.flatten.desc", "Remove all interactive elements and forms from a PDF"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_SECURITY
    },
    "unlock-pdf-forms": {
        icon: <span className="material-symbols-rounded">preview_off</span>,
        name: t("home.unlockPDFForms.title", "Unlock PDF Forms"),
        component: null,
        view: "security",
        description: t("home.unlockPDFForms.desc", "Remove read-only property of form fields in a PDF document."),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_SECURITY
    },
    "manage-certificates": {
        icon: <span className="material-symbols-rounded">license</span>,
        name: t("home.manageCertificates.title", "Manage Certificates"),
        component: null,
        view: "security",
        description: t("home.manageCertificates.desc", "Import, export, or delete digital certificate files used for signing PDFs."),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_SECURITY
    },
    "change-permissions": {
        icon: <span className="material-symbols-rounded">lock</span>,
        name: t("home.changePermissions.title", "Change Permissions"),
        component: ChangePermissions,
        view: "security",
        description: t("home.changePermissions.desc", "Change document restrictions and permissions"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_SECURITY,
        maxFiles: -1,
        endpoints: ["add-password"]
    },
    // Verification

    "get-all-info-on-pdf": {
        icon: <span className="material-symbols-rounded">fact_check</span>,
        name: t("home.getPdfInfo.title", "Get ALL Info on PDF"),
        component: null,
        view: "extract",
        description: t("home.getPdfInfo.desc", "Grabs any and all information possible on PDFs"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.VERIFICATION
    },
    "validate-pdf-signature": {
        icon: <span className="material-symbols-rounded">verified</span>,
        name: t("home.validateSignature.title", "Validate PDF Signature"),
        component: null,
        view: "security",
        description: t("home.validateSignature.desc", "Verify digital signatures and certificates in PDF documents"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.VERIFICATION
    },
    
    
    // Document Review

    "read": {
        icon: <span className="material-symbols-rounded">article</span>,
        name: t("home.read.title", "Read"),
        component: null,
        view: "view",
        description: t("home.read.desc", "View and annotate PDFs. Highlight text, draw, or insert comments for review and collaboration."),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_REVIEW
    },
    "change-metadata": {
        icon: <span className="material-symbols-rounded">assignment</span>,
        name: t("home.changeMetadata.title", "Change Metadata"),
        component: null,
        view: "format",
        description: t("home.changeMetadata.desc", "Change/Remove/Add metadata from a PDF document"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.DOCUMENT_REVIEW
    },
    // Page Formatting

    "cropPdf": {
        icon: <span className="material-symbols-rounded">crop</span>,
        name: t("home.crop.title", "Crop PDF"),
        component: null,
        view: "format",
        description: t("home.crop.desc", "Crop a PDF to reduce its size (maintains text!)"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.PAGE_FORMATTING
    },
    "rotate": {
        icon: <span className="material-symbols-rounded">rotate_right</span>,
        name: t("home.rotate.title", "Rotate"),
        component: null,
        view: "format",
        description: t("home.rotate.desc", "Easily rotate your PDFs."),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.PAGE_FORMATTING
    },
    "splitPdf": {
        icon: <span className="material-symbols-rounded">content_cut</span>,
        name: t("home.split.title", "Split"),
        component: SplitPdfPanel,
        view: "split",
        description: t("home.split.desc", "Split PDFs into multiple documents"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.PAGE_FORMATTING
    },
    "reorganize-pages": {
        icon: <span className="material-symbols-rounded">move_down</span>,
        name: t("home.reorganizePages.title", "Reorganize Pages"),
        component: null,
        view: "pageEditor",
        description: t("home.reorganizePages.desc", "Rearrange, duplicate, or delete PDF pages with visual drag-and-drop control."),
        category: ToolCategory.STANDARD_TOOLS, 
        subcategory: ToolSubcategory.PAGE_FORMATTING
    },
    "adjust-page-size-scale": {
        icon: <span className="material-symbols-rounded">crop_free</span>,
        name: t("home.scalePages.title", "Adjust page size/scale"),
        component: null,
        view: "format",
        description: t("home.scalePages.desc", "Change the size/scale of a page and/or its contents."),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.PAGE_FORMATTING
    },
    "add-page-numbers": {
        icon: <span className="material-symbols-rounded">123</span>,
        name: t("home.add-page-numbers.title", "Add Page Numbers"),
        component: null,
        view: "format",
        description: t("home.add-page-numbers.desc", "Add Page numbers throughout a document in a set location"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.PAGE_FORMATTING
    },
    "multi-page-layout": {
        icon: <span className="material-symbols-rounded">dashboard</span>,
        name: t("home.pageLayout.title", "Multi-Page Layout"),
        component: null,
        view: "format",
        description: t("home.pageLayout.desc", "Merge multiple pages of a PDF document into a single page"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.PAGE_FORMATTING
    },
    "single-large-page": {
        icon: <span className="material-symbols-rounded">looks_one</span>,
        name: t("home.PdfToSinglePage.title", "PDF to Single Large Page"),
        component: null,
        view: "format",
        description: t("home.PdfToSinglePage.desc", "Merges all PDF pages into one large single page"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.PAGE_FORMATTING
    },
    "add-attachments": {
        icon: <span className="material-symbols-rounded">attachment</span>,
        name: t("home.attachments.title", "Add Attachments"),
        component: null,
        view: "format",
        description: t("home.attachments.desc", "Add or remove embedded files (attachments) to/from a PDF"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.PAGE_FORMATTING,
    },


    // Extraction

    "extract-pages": {
        icon: <span className="material-symbols-rounded">upload</span>,
        name: t("home.extractPage.title", "Extract Pages"),
        component: null,
        view: "extract",
        description: t("home.extractPage.desc", "Extract specific pages from a PDF document"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.EXTRACTION
    },
    "extract-images": {
        icon: <span className="material-symbols-rounded">filter</span>,
        name: t("home.extractImages.title", "Extract Images"),
        component: null,
        view: "extract",
        description: t("home.extractImages.desc", "Extract images from PDF documents"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.EXTRACTION
    },


    // Removal

    "remove": {
        icon: <span className="material-symbols-rounded">delete</span>,
        name: t("home.removePages.title", "Remove Pages"),
        component: null,
        view: "remove",
        description: t("home.removePages.desc", "Remove specific pages from a PDF document"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.REMOVAL
    },
    "remove-blank-pages": {
        icon: <span className="material-symbols-rounded">scan_delete</span>,
        name: t("home.removeBlanks.title", "Remove Blank Pages"),
        component: null,
        view: "remove",
        description: t("home.removeBlanks.desc", "Remove blank pages from PDF documents"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.REMOVAL
    },
    "remove-annotations": {
        icon: <span className="material-symbols-rounded">thread_unread</span>,
        name: t("home.removeAnnotations.title", "Remove Annotations"),
        component: null,
        view: "remove",
        description: t("home.removeAnnotations.desc", "Remove annotations and comments from PDF documents"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.REMOVAL
    },
    "remove-image": {
        icon: <span className="material-symbols-rounded">remove_selection</span>,
        name: t("home.removeImagePdf.title", "Remove Image"),
        component: null,
        view: "format",
        description: t("home.removeImagePdf.desc", "Remove images from PDF documents"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.REMOVAL
    },
    "remove-password": {
        icon: <span className="material-symbols-rounded">lock_open_right</span>,
        name: t("home.removePassword.title", "Remove Password"),
        component: RemovePassword,
        view: "security",
        description: t("home.removePassword.desc", "Remove password protection from PDF documents"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.REMOVAL,
        endpoints: ["remove-password"],
        maxFiles: -1,

    },
    "remove-certificate-sign": {
        icon: <span className="material-symbols-rounded">remove_moderator</span>,
        name: t("home.removeCertSign.title", "Remove Certificate Signatures"),
        component: null,
        view: "security",
        description: t("home.removeCertSign.desc", "Remove digital signatures from PDF documents"),
        category: ToolCategory.STANDARD_TOOLS,
        subcategory: ToolSubcategory.REMOVAL
    },


    // Automation

    "automate": {
        icon: <span className="material-symbols-rounded">automation</span>,
        name: t("home.automate.title", "Automate"),
        component: null,
        view: "format",
        description: t("home.automate.desc", "Build multi-step workflows by chaining together PDF actions. Ideal for recurring tasks."),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.AUTOMATION
    },
    "auto-rename-pdf-file": {
        icon: <span className="material-symbols-rounded">match_word</span>,
        name: t("home.auto-rename.title", "Auto Rename PDF File"),
        component: null,
        view: "format",
        description: t("home.auto-rename.desc", "Automatically rename PDF files based on their content"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.AUTOMATION
    },
    "auto-split-pages": {
        icon: <span className="material-symbols-rounded">split_scene_right</span>,
        name: t("home.autoSplitPDF.title", "Auto Split Pages"),
        component: null,
        view: "format",
        description: t("home.autoSplitPDF.desc", "Automatically split PDF pages based on content detection"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.AUTOMATION
    },
    "auto-split-by-size-count": {
        icon: <span className="material-symbols-rounded">content_cut</span>,
        name: t("home.autoSizeSplitPDF.title", "Auto Split by Size/Count"),
        component: null,
        view: "format",
        description: t("home.autoSizeSplitPDF.desc", "Automatically split PDFs by file size or page count"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.AUTOMATION
    },


    // Advanced Formatting

    "adjust-colors-contrast": {
        icon: <span className="material-symbols-rounded">palette</span>,
        name: t("home.adjust-contrast.title", "Adjust Colors/Contrast"),
        component: null,
        view: "format",
        description: t("home.adjust-contrast.desc", "Adjust colors and contrast of PDF documents"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.ADVANCED_FORMATTING
    },
    "repair": {
        icon: <span className="material-symbols-rounded">build</span>,
        name: t("home.repair.title", "Repair"),
        component: null,
        view: "format",
        description: t("home.repair.desc", "Repair corrupted or damaged PDF files"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.ADVANCED_FORMATTING
    },
    "detect-split-scanned-photos": {
        icon: <span className="material-symbols-rounded">scanner</span>,
        name: t("home.ScannerImageSplit.title", "Detect & Split Scanned Photos"),
        component: null,
        view: "format",
        description: t("home.ScannerImageSplit.desc", "Detect and split scanned photos into separate pages"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.ADVANCED_FORMATTING
    },
    "overlay-pdfs": {
        icon: <span className="material-symbols-rounded">layers</span>,
        name: t("home.overlay-pdfs.title", "Overlay PDFs"),
        component: null,
        view: "format",
        description: t("home.overlay-pdfs.desc", "Overlay one PDF on top of another"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.ADVANCED_FORMATTING
    },
    "replace-and-invert-color": {
        icon: <span className="material-symbols-rounded">format_color_fill</span>,
        name: t("home.replaceColorPdf.title", "Replace & Invert Color"),
        component: null,
        view: "format",
        description: t("home.replaceColorPdf.desc", "Replace or invert colors in PDF documents"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.ADVANCED_FORMATTING
    },
    "add-image": {
        icon: <span className="material-symbols-rounded">image</span>,
        name: t("home.addImage.title", "Add Image"),
        component: null,
        view: "format",
        description: t("home.addImage.desc", "Add images to PDF documents"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.ADVANCED_FORMATTING
    },
    "edit-table-of-contents": {
        icon: <span className="material-symbols-rounded">bookmark_add</span>,
        name: t("home.editTableOfContents.title", "Edit Table of Contents"),
        component: null,
        view: "format",
        description: t("home.editTableOfContents.desc", "Add or edit bookmarks and table of contents in PDF documents"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.ADVANCED_FORMATTING
    },
    "scanner-effect": {
        icon: <span className="material-symbols-rounded">scanner</span>,
        name: t("home.fakeScan.title", "Scanner Effect"),
        component: null,
        view: "format",
        description: t("home.fakeScan.desc", "Create a PDF that looks like it was scanned"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.ADVANCED_FORMATTING
    },


    // Developer Tools

    "show-javascript": {
        icon: <span className="material-symbols-rounded">javascript</span>,
        name: t("home.showJS.title", "Show JavaScript"),
        component: null,
        view: "extract",
        description: t("home.showJS.desc", "Extract and display JavaScript code from PDF documents"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.DEVELOPER_TOOLS
    },
    "dev-api": {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: t("home.devApi.title", "API"),
        component: null,
        view: "external",
        description: t("home.devApi.desc", "Link to API documentation"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.DEVELOPER_TOOLS,
        link: "https://stirlingpdf.io/swagger-ui/5.21.0/index.html"
    },
    "dev-folder-scanning": {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: t("home.devFolderScanning.title", "Automated Folder Scanning"),
        component: null,
        view: "external",
        description: t("home.devFolderScanning.desc", "Link to automated folder scanning guide"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Advanced%20Configuration/Folder%20Scanning/"
    },
    "dev-sso-guide": {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: t("home.devSsoGuide.title", "SSO Guide"),
        component: null,
        view: "external",
        description: t("home.devSsoGuide.desc", "Link to SSO guide"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Advanced%20Configuration/Single%20Sign-On%20Configuration",
    },
    "dev-airgapped": {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: t("home.devAirgapped.title", "Air-gapped Setup"),
        component: null,
        view: "external",
        description: t("home.devAirgapped.desc", "Link to air-gapped setup guide"),
        category: ToolCategory.ADVANCED_TOOLS,
        subcategory: ToolSubcategory.DEVELOPER_TOOLS,
        link: "https://docs.stirlingpdf.com/Pro/#activation"
    },


    // Recommended Tools
    "compare": {
        icon: <span className="material-symbols-rounded">compare</span>,
        name: t("home.compare.title", "Compare"),
        component: null,
        view: "format",
        description: t("home.compare.desc", "Compare two PDF documents and highlight differences"),
        category: ToolCategory.RECOMMENDED_TOOLS,
        subcategory: ToolSubcategory.GENERAL
    },
    "compressPdfs": {
        icon: <span className="material-symbols-rounded">zoom_in_map</span>,
        name: t("home.compressPdfs.title", "Compress"),
        component: CompressPdfPanel,
        view: "compress",
        description: t("home.compressPdfs.desc", "Compress PDFs to reduce their file size."),
        category: ToolCategory.RECOMMENDED_TOOLS,
        subcategory: ToolSubcategory.GENERAL,
        maxFiles: -1
    },
    "convert": {
        icon: <span className="material-symbols-rounded">sync_alt</span>,
        name: t("home.fileToPDF.title", "Convert"),
        component: ConvertPanel,
        view: "convert",
        description: t("home.fileToPDF.desc", "Convert files to and from PDF format"),
        category: ToolCategory.RECOMMENDED_TOOLS,
        subcategory: ToolSubcategory.GENERAL,
        maxFiles: -1,
        endpoints: [
            "pdf-to-img",
            "img-to-pdf",
            "pdf-to-word",
            "pdf-to-presentation",
            "pdf-to-text",
            "pdf-to-html",
            "pdf-to-xml",
            "html-to-pdf",
            "markdown-to-pdf",
            "file-to-pdf",
            "pdf-to-csv",
            "pdf-to-markdown",
            "pdf-to-pdfa",
            "eml-to-pdf"
        ],
        supportedFormats: [
            // Microsoft Office
            "doc", "docx", "dot", "dotx", "csv", "xls", "xlsx", "xlt", "xltx", "slk", "dif", "ppt", "pptx",
            // OpenDocument
            "odt", "ott", "ods", "ots", "odp", "otp", "odg", "otg",
            // Text formats
            "txt", "text", "xml", "rtf", "html", "lwp", "md",
            // Images
            "bmp", "gif", "jpeg", "jpg", "png", "tif", "tiff", "pbm", "pgm", "ppm", "ras", "xbm", "xpm", "svg", "svm", "wmf", "webp",
            // StarOffice
            "sda", "sdc", "sdd", "sdw", "stc", "std", "sti", "stw", "sxd", "sxg", "sxi", "sxw",
            // Email formats
            "eml",
            // Archive formats
            "zip",
            // Other
            "dbf", "fods", "vsd", "vor", "vor3", "vor4", "uop", "pct", "ps", "pdf"
        ]
    },
    "mergePdfs": {
        icon: <span className="material-symbols-rounded">library_add</span>,
        name: t("home.merge.title", "Merge"),
        component: null,
        view: "merge",
        description: t("home.merge.desc", "Merge multiple PDFs into a single document"),
        category: ToolCategory.RECOMMENDED_TOOLS,
        subcategory: ToolSubcategory.GENERAL,
        maxFiles: -1
    },
    "multi-tool": {
        icon: <span className="material-symbols-rounded">dashboard_customize</span>,
        name: t("home.multiTool.title", "Multi-Tool"),
        component: null,
        view: "pageEditor",
        description: t("home.multiTool.desc", "Use multiple tools on a single PDF document"),
        category: ToolCategory.RECOMMENDED_TOOLS,
        subcategory: ToolSubcategory.GENERAL,
        maxFiles: -1
    },
    "ocr": {
        icon: <span className="material-symbols-rounded">quick_reference_all</span>,
        name: t("home.ocr.title", "OCR"),
        component: OCRPanel,
        view: "convert",
        description: t("home.ocr.desc", "Extract text from scanned PDFs using Optical Character Recognition"),
        category: ToolCategory.RECOMMENDED_TOOLS,
        subcategory: ToolSubcategory.GENERAL,
        maxFiles: -1
    },
    "redact": {
        icon: <span className="material-symbols-rounded">visibility_off</span>,
        name: t("home.redact.title", "Redact"),
        component: null,
        view: "redact",
        description: t("home.redact.desc", "Permanently remove sensitive information from PDF documents"),
        category: ToolCategory.RECOMMENDED_TOOLS,
        subcategory: ToolSubcategory.GENERAL
    },
    };
}


export const toolEndpoints: Record<string, string[]> = {
    split: ["split-pages",
        "split-pdf-by-sections",
        "split-by-size-or-count",
        "split-pdf-by-chapters"],
    compressPdfs: ["compress-pdf"],
    merge: ["merge-pdfs"],
    // Add more endpoint mappings as needed
};

/**
 * Get all endpoints from both registry entries and legacy toolEndpoints mapping
 * This consolidates endpoint discovery logic in one place
 */
export const getAllEndpoints = (registry: ToolRegistry): string[] => {
    const lists: string[][] = [];
    
    // Get endpoints from registry entries
    Object.values(registry).forEach(entry => {
        if (entry.endpoints && entry.endpoints.length > 0) {
            lists.push(entry.endpoints);
        }
    });
    
    // Get endpoints from legacy toolEndpoints mapping
    Object.entries(toolEndpoints).forEach(([key, list]) => {
        // Only add if not already covered by registry entries
        if (!registry[key]?.endpoints) {
            lists.push(list);
        }
    });
    
    return Array.from(new Set(lists.flat()));
};

/**
 * Get all endpoints from a conversion matrix (like EXTENSION_TO_ENDPOINT)
 * This is useful for convert-specific endpoint discovery
 */
export const getConversionEndpoints = (extensionToEndpoint: Record<string, Record<string, string>>): string[] => {
    const endpoints = new Set<string>();
    Object.values(extensionToEndpoint).forEach(toEndpoints => {
        Object.values(toEndpoints).forEach(endpoint => {
            endpoints.add(endpoint);
        });
    });
    return Array.from(endpoints);
};

/**
 * Get all endpoints from both tool registry and conversion matrix
 * This provides comprehensive endpoint coverage for the entire application
 */
export const getAllApplicationEndpoints = (
    registry: ToolRegistry, 
    extensionToEndpoint?: Record<string, Record<string, string>>
): string[] => {
    const toolEndpoints = getAllEndpoints(registry);
    const conversionEndpoints = extensionToEndpoint ? getConversionEndpoints(extensionToEndpoint) : [];
    
    return Array.from(new Set([...toolEndpoints, ...conversionEndpoints]));
};