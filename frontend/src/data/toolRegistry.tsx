import React from 'react';
import SplitPdfPanel from "../tools/Split";
import CompressPdfPanel from "../tools/Compress";
import OCRPanel from '../tools/OCR';
import ConvertPanel from '../tools/Convert';

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

/**
 * Shape overview:
 * - flatToolRegistryMap: { [toolId]: ToolRegistryEntry }
 * - buildStructuredRegistry(): {
 *     QUICK_ACCESS: Array<ToolRegistryEntry & { id: string }>,
 *     ALL_TOOLS: { [category]: { [subcategory]: Array<ToolRegistryEntry & { id: string }> } }
 *   }
 * - baseToolRegistry: [ { QUICK_ACCESS }, { ALL_TOOLS } ]
 *   Quick reference helpers are provided below for convenience.
 */
// Ordered list used elsewhere for display ordering
// Subcategory display order (top to bottom, left to right)
export const SUBCATEGORY_ORDER: string[] = [
    'Signing',
    'Document Security',
    'Verification',
    'Document Review',
    'Page Formatting',
    'Extraction',
    'Removal',
    'Automation',
    'General',
    'Advanced Formatting',
    'Developer Tools',
];

// Color coding for subcategories (loosely resembling the v1 color palette)
export const SUBCATEGORY_COLOR_MAP: Record<string, string> = {
    // Security & Signing (pink)
    'Signing': '#FF7892',
    'Document Security': '#FF7892',
    // Review / Verification (blue-green)
    'Verification': '#1BB1D4',
    'Document Review': '#48BD54',
    // Organize / Page operations (purple/organize + blue accents)
    'Page Formatting': '#7882FF',
    'Removal': '#7882FF',
    'Extraction': '#1BB1D4',
    // Automation / General quick actions (green)
    'Automation': '#69DC95',
    'General': '#69DC95',
    // Advanced buckets (red family)
    'Advanced Formatting': '#F55454',
    'Developer Tools': '#F55454',
};

export const getSubcategoryColor = (subcategory?: string | null): string => {
    if (!subcategory) return '#7882FF';
    return SUBCATEGORY_COLOR_MAP[subcategory] || '#7882FF';
};

// Grouped structure by subcategory (ordered by SUBCATEGORY_ORDER)
export type SubcategoryGroup = {
    name: string;
    color: string;
    tools: (ToolRegistryEntry & { id: string })[];
};

export const getAllToolsBySubcategoryOrdered = (): SubcategoryGroup[] => {
    const entries: Array<[string, ToolRegistryEntry]> = Object.entries(flatToolRegistryMap);
    const grouping: Record<string, SubcategoryGroup> = {};
    for (const [id, tool] of entries) {
        const sub = tool.subcategory ?? 'General';
        if (!grouping[sub]) {
            grouping[sub] = {
                name: sub,
                color: getSubcategoryColor(sub),
                tools: [],
            };
        }
        grouping[sub].tools.push({ id, ...tool });
    }
    // Order tools within each subcategory alphabetically by name (display key)
    Object.values(grouping).forEach(group => {
        group.tools.sort((a, b) => a.name.localeCompare(b.name));
    });
    // Return groups ordered by SUBCATEGORY_ORDER
    const ordered: SubcategoryGroup[] = [];
    SUBCATEGORY_ORDER.forEach(sub => {
        if (grouping[sub]) ordered.push(grouping[sub]);
    });
    // Append any subcategories not explicitly listed
    Object.keys(grouping)
        .filter(name => !SUBCATEGORY_ORDER.includes(name))
        .sort((a, b) => a.localeCompare(b))
        .forEach(name => ordered.push(grouping[name]));
    return ordered;
};

export const flatToolRegistryMap: ToolRegistry = {
    
    
    // Signing

    "certSign": {
        icon: <span className="material-symbols-rounded">workspace_premium</span>,
        name: "home.certSign.title",
        component: null,
        view: "sign",
        description: "home.certSign.desc",
        category: "Standard Tools",
        subcategory: "Signing"
    },
    "sign": {
        icon: <span className="material-symbols-rounded">signature</span>,
        name: "home.sign.title",
        component: null,
        view: "sign",
        description: "home.sign.desc",
        category: "Standard Tools",
        subcategory: "Signing"
    },


    // Document Security

    "add-password": {
        icon: <span className="material-symbols-rounded">password</span>,
        name: "home.addPassword.title",
        component: null,
        view: "security",
        description: "home.addPassword.desc",
        category: "Standard Tools",
        subcategory: "Document Security"
    },
    "add-watermark": {
        icon: <span className="material-symbols-rounded">branding_watermark</span>,
        name: "home.watermark.title",
        component: null,
        view: "format",
        description: "home.watermark.desc",
        category: "Standard Tools",
        subcategory: "Document Security"
    },
    "add-stamp": {
        icon: <span className="material-symbols-rounded">approval</span>,
        name: "home.AddStampRequest.title",
        component: null,
        view: "format",
        description: "home.AddStampRequest.desc",
        category: "Standard Tools",
        subcategory: "Document Security"
    },
    "sanitize": {
        icon: <span className="material-symbols-rounded">sanitizer</span>,
        name: "home.sanitizePdf.title",
        component: null,
        view: "security",
        description: "home.sanitizePdf.desc",
        category: "Standard Tools",
        subcategory: "Document Security"
    },
    "flatten": {
        icon: <span className="material-symbols-rounded">layers_clear</span>,
        name: "home.flatten.title",
        component: null,
        view: "format",
        description: "home.flatten.desc",
        category: "Standard Tools",
        subcategory: "Document Security"
    },
    "unlock-pdf-forms": {
        icon: <span className="material-symbols-rounded">preview_off</span>,
        name: "home.unlockPDFForms.title",
        component: null,
        view: "security",
        description: "home.unlockPDFForms.desc",
        category: "Standard Tools",
        subcategory: "Document Security"
    },
    "manage-certificates": {
        icon: <span className="material-symbols-rounded">license</span>,
        name: "home.manageCertificates.title",
        component: null,
        view: "security",
        description: "home.manageCertificates.desc",
        category: "Standard Tools",
        subcategory: "Document Security"
    },

    
    // Verification

    "get-all-info-on-pdf": {
        icon: <span className="material-symbols-rounded">fact_check</span>,
        name: "home.getPdfInfo.title",
        component: null,
        view: "extract",
        description: "home.getPdfInfo.desc",
        category: "Standard Tools",
        subcategory: "Verification"
    },
    "validate-pdf-signature": {
        icon: <span className="material-symbols-rounded">verified</span>,
        name: "home.validateSignature.title",
        component: null,
        view: "security",
        description: "home.validateSignature.desc",
        category: "Standard Tools",
        subcategory: "Verification"
    },
    
    
    // Document Review

    "read": {
        icon: <span className="material-symbols-rounded">article</span>,
        name: "home.read.title",
        component: null,
        view: "view",
        description: "home.read.desc",
        category: "Standard Tools",
        subcategory: "Document Review"
    },
    "change-metadata": {
        icon: <span className="material-symbols-rounded">assignment</span>,
        name: "home.changeMetadata.title",
        component: null,
        view: "format",
        description: "home.changeMetadata.desc",
        category: "Standard Tools",
        subcategory: "Document Review"
    },
    "change-permissions": {
        icon: <span className="material-symbols-rounded">admin_panel_settings</span>,
        name: "home.permissions.title",
        component: null,
        view: "security",
        description: "home.permissions.desc",
        category: "Standard Tools",
        subcategory: "Document Review"
    },

    
    // Page Formatting

    "cropPdf": {
        icon: <span className="material-symbols-rounded">crop</span>,
        name: "home.crop.title",
        component: null,
        view: "format",
        description: "home.crop.desc",
        category: "Standard Tools",
        subcategory: "Page Formatting"
    },
    "rotate": {
        icon: <span className="material-symbols-rounded">rotate_right</span>,
        name: "home.rotate.title",
        component: null,
        view: "format",
        description: "home.rotate.desc",
        category: "Standard Tools",
        subcategory: "Page Formatting"
    },
    "splitPdf": {
        icon: <span className="material-symbols-rounded">content_cut</span>,
        name: "home.split.title",
        component: SplitPdfPanel,
        view: "split",
        description: "home.split.desc",
        category: "Standard Tools",
        subcategory: "Page Formatting"
    },
    "reorganize-pages": {
        icon: <span className="material-symbols-rounded">move_down</span>,
        name: "home.reorganizePages.title",
        component: null,
        view: "pageEditor",
        description: "home.reorganizePages.desc",
        category: "Standard Tools", 
        subcategory: "Page Formatting"
    },
    "adjust-page-size-scale": {
        icon: <span className="material-symbols-rounded">crop_free</span>,
        name: "home.scalePages.title",
        component: null,
        view: "format",
        description: "home.scalePages.desc",
        category: "Standard Tools",
        subcategory: "Page Formatting"
    },
    "add-page-numbers": {
        icon: <span className="material-symbols-rounded">123</span>,
        name: "home.add-page-numbers.title",
        component: null,
        view: "format",
        description: "home.add-page-numbers.desc",
        category: "Standard Tools",
        subcategory: "Page Formatting"
    },
    "multi-page-layout": {
        icon: <span className="material-symbols-rounded">dashboard</span>,
        name: "home.pageLayout.title",
        component: null,
        view: "format",
        description: "home.pageLayout.desc",
        category: "Standard Tools",
        subcategory: "Page Formatting"
    },
    "single-large-page": {
        icon: <span className="material-symbols-rounded">looks_one</span>,
        name: "home.PdfToSinglePage.title",
        component: null,
        view: "format",
        description: "home.PdfToSinglePage.desc",
        category: "Standard Tools",
        subcategory: "Page Formatting"
    },
    "add-attachments": {
        icon: <span className="material-symbols-rounded">attachment</span>,
        name: "home.attachments.title",
        component: null,
        view: "format",
        description: "home.attachments.desc",
        category: "Standard Tools",
        subcategory: "Page Formatting",
    },


    // Extraction

    "extract-pages": {
        icon: <span className="material-symbols-rounded">upload</span>,
        name: "home.extractPage.title",
        component: null,
        view: "extract",
        description: "home.extractPage.desc",
        category: "Standard Tools",
        subcategory: "Extraction"
    },
    "extract-images": {
        icon: <span className="material-symbols-rounded">filter</span>,
        name: "home.extractImages.title",
        component: null,
        view: "extract",
        description: "home.extractImages.desc",
        category: "Standard Tools",
        subcategory: "Extraction"
    },


    // Removal

    "remove": {
        icon: <span className="material-symbols-rounded">delete</span>,
        name: "home.removePages.title",
        component: null,
        view: "remove",
        description: "home.removePages.desc",
        category: "Standard Tools",
        subcategory: "Removal"
    },
    "remove-blank-pages": {
        icon: <span className="material-symbols-rounded">scan_delete</span>,
        name: "home.removeBlanks.title",
        component: null,
        view: "remove",
        description: "home.removeBlanks.desc",
        category: "Standard Tools",
        subcategory: "Removal"
    },
    "remove-annotations": {
        icon: <span className="material-symbols-rounded">thread_unread</span>,
        name: "home.removeAnnotations.title",
        component: null,
        view: "remove",
        description: "home.removeAnnotations.desc",
        category: "Standard Tools",
        subcategory: "Removal"
    },
    "remove-image": {
        icon: <span className="material-symbols-rounded">remove_selection</span>,
        name: "home.removeImagePdf.title",
        component: null,
        view: "format",
        description: "home.removeImagePdf.desc",
        category: "Standard Tools",
        subcategory: "Removal"
    },
    "remove-password": {
        icon: <span className="material-symbols-rounded">lock_open_right</span>,
        name: "home.removePassword.title",
        component: null,
        view: "security",
        description: "home.removePassword.desc",
        category: "Standard Tools",
        subcategory: "Removal"
    },
    "remove-certificate-sign": {
        icon: <span className="material-symbols-rounded">remove_moderator</span>,
        name: "home.removeCertSign.title",
        component: null,
        view: "security",
        description: "home.removeCertSign.desc",
        category: "Standard Tools",
        subcategory: "Removal"
    },


    // Automation

    "automate": {
        icon: <span className="material-symbols-rounded">automation</span>,
        name: "home.automate.title",
        component: null,
        view: "format",
        description: "home.automate.desc",
        category: "Advanced Tools",
        subcategory: "Automation"
    },
    "auto-rename-pdf-file": {
        icon: <span className="material-symbols-rounded">match_word</span>,
        name: "home.auto-rename.title",
        component: null,
        view: "format",
        description: "home.auto-rename.desc",
        category: "Advanced Tools",
        subcategory: "Automation"
    },
    "auto-split-pages": {
        icon: <span className="material-symbols-rounded">split_scene_right</span>,
        name: "home.autoSplitPDF.title",
        component: null,
        view: "format",
        description: "home.autoSplitPDF.desc",
        category: "Advanced Tools",
        subcategory: "Automation"
    },
    "auto-split-by-size-count": {
        icon: <span className="material-symbols-rounded">content_cut</span>,
        name: "home.autoSizeSplitPDF.title",
        component: null,
        view: "format",
        description: "home.autoSizeSplitPDF.desc",
        category: "Advanced Tools",
        subcategory: "Automation"
    },


    // Advanced Formatting

    "adjust-colors-contrast": {
        icon: <span className="material-symbols-rounded">palette</span>,
        name: "home.adjust-contrast.title",
        component: null,
        view: "format",
        description: "home.adjust-contrast.desc",
        category: "Advanced Tools",
        subcategory: "Advanced Formatting"
    },
    "repair": {
        icon: <span className="material-symbols-rounded">build</span>,
        name: "home.repair.title",
        component: null,
        view: "format",
        description: "home.repair.desc",
        category: "Advanced Tools",
        subcategory: "Advanced Formatting"
    },
    "detect-split-scanned-photos": {
        icon: <span className="material-symbols-rounded">scanner</span>,
        name: "home.ScannerImageSplit.title",
        component: null,
        view: "format",
        description: "home.ScannerImageSplit.desc",
        category: "Advanced Tools",
        subcategory: "Advanced Formatting"
    },
    "overlay-pdfs": {
        icon: <span className="material-symbols-rounded">layers</span>,
        name: "home.overlay-pdfs.title",
        component: null,
        view: "format",
        description: "home.overlay-pdfs.desc",
        category: "Advanced Tools",
        subcategory: "Advanced Formatting"
    },
    "replace-and-invert-color": {
        icon: <span className="material-symbols-rounded">format_color_fill</span>,
        name: "home.replaceColorPdf.title",
        component: null,
        view: "format",
        description: "home.replaceColorPdf.desc",
        category: "Advanced Tools",
        subcategory: "Advanced Formatting"
    },
    "add-image": {
        icon: <span className="material-symbols-rounded">image</span>,
        name: "home.addImage.title",
        component: null,
        view: "format",
        description: "home.addImage.desc",
        category: "Advanced Tools",
        subcategory: "Advanced Formatting"
    },
    "edit-table-of-contents": {
        icon: <span className="material-symbols-rounded">bookmark_add</span>,
        name: "home.editTableOfContents.title",
        component: null,
        view: "format",
        description: "home.editTableOfContents.desc",
        category: "Advanced Tools",
        subcategory: "Advanced Formatting"
    },
    "scanner-effect": {
        icon: <span className="material-symbols-rounded">scanner</span>,
        name: "home.fakeScan.title",
        component: null,
        view: "format",
        description: "home.fakeScan.desc",
        category: "Advanced Tools",
        subcategory: "Advanced Formatting"
    },


    // Developer Tools

    "show-javascript": {
        icon: <span className="material-symbols-rounded">javascript</span>,
        name: "home.showJS.title",
        component: null,
        view: "extract",
        description: "home.showJS.desc",
        category: "Advanced Tools",
        subcategory: "Developer Tools"
    },
    "dev-api": {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: "API",
        component: null,
        view: "external",
        description: "https://stirlingpdf.io/swagger-ui/5.21.0/index.html",
        category: "Advanced Tools",
        subcategory: "Developer Tools"
    },
    "dev-folder-scanning": {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: "Automated Folder Scanning",
        component: null,
        view: "external",
        description: "https://docs.stirlingpdf.com/Advanced%20Configuration/Folder%20Scanning/",
        category: "Advanced Tools",
        subcategory: "Developer Tools"
    },
    "dev-sso-guide": {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: "SSO Guide",
        component: null,
        view: "external",
        description: "https://docs.stirlingpdf.com/Advanced%20Configuration/Single%20Sign-On%20Configuration",
        category: "Advanced Tools",
        subcategory: "Developer Tools"
    },
    "dev-airgapped": {
        icon: <span className="material-symbols-rounded" style={{ color: '#2F7BF6' }}>open_in_new</span>,
        name: "Air-gapped Setup",
        component: null,
        view: "external",
        description: "https://docs.stirlingpdf.com/Pro/#activation",
        category: "Advanced Tools",
        subcategory: "Developer Tools"
    },


    // Recommended Tools
    "compare": {
        icon: <span className="material-symbols-rounded">compare</span>,
        name: "home.compare.title",
        component: null,
        view: "format",
        description: "home.compare.desc",
        category: "Recommended Tools",
        subcategory: null
    },
    "compressPdfs": {
        icon: <span className="material-symbols-rounded">zoom_in_map</span>,
        name: "home.compressPdfs.title",
        component: CompressPdfPanel,
        view: "compress",
        description: "home.compressPdfs.desc",
        category: "Recommended Tools",
        subcategory: null
    },
    "convert": {
        icon: <span className="material-symbols-rounded">sync_alt</span>,
        name: "home.fileToPDF.title",
        component: ConvertPanel,
        view: "convert",
        description: "home.fileToPDF.desc",
        category: "Recommended Tools",
        subcategory: null
    },
    "mergePdfs": {
        icon: <span className="material-symbols-rounded">library_add</span>,
        name: "home.merge.title",
        component: null,
        view: "merge",
        description: "home.merge.desc",
        category: "Recommended Tools",
        subcategory: null
    },
    "multi-tool": {
        icon: <span className="material-symbols-rounded">dashboard_customize</span>,
        name: "home.multiTool.title",
        component: null,
        view: "pageEditor",
        description: "home.multiTool.desc",
        category: "Recommended Tools",
        subcategory: null
    },
    "ocr": {
        icon: <span className="material-symbols-rounded">quick_reference_all</span>,
        name: "home.ocr.title",
        component: OCRPanel,
        view: "convert",
        description: "home.ocr.desc",
        category: "Recommended Tools",
        subcategory: null
    },
    "redact": {
        icon: <span className="material-symbols-rounded">visibility_off</span>,
        name: "home.redact.title",
        component: null,
        view: "redact",
        description: "home.redact.desc",
        category: "Recommended Tools",
        subcategory: null
    },
    "view-pdf": {
        icon: <span className="material-symbols-rounded">article</span>,
        name: "home.viewPdf.title",
        component: null,
        view: "view",
        description: "home.viewPdf.desc",
        category: "Recommended Tools",
        subcategory: null
    }
};

// Build structured registry that preserves order for sections
export type ToolConfig = ToolRegistryEntry & { id: string };
export type ToolRegistryStructured = {
    QUICK_ACCESS: ToolConfig[];
    ALL_TOOLS: Record<string, Record<string, ToolConfig[]>>;
};

function buildStructuredRegistry(): ToolRegistryStructured {
    const entries: Array<[string, ToolRegistryEntry]> = Object.entries(flatToolRegistryMap);
    const quick: ToolConfig[] = [];
    const all: Record<string, Record<string, ToolConfig[]>> = {};

    for (const [id, tool] of entries) {
        const sub = tool.subcategory ?? 'General';
        const cat = tool.category ?? 'OTHER';
        // Quick access: use the existing "Recommended Tools" category, this will change in future
        if (tool.category === 'Recommended Tools') {
            quick.push({ id, ...tool });
        }
        if (!all[cat]) all[cat] = {};
        if (!all[cat][sub]) all[cat][sub] = [];
        all[cat][sub].push({ id, ...tool });
    }

    // Preserve subcategory ordering within each category
    for (const cat of Object.keys(all)) {
        const subcats = all[cat];
        const ordered: Record<string, ToolConfig[]> = {};
        SUBCATEGORY_ORDER.forEach(orderName => {
            if (subcats[orderName]) ordered[orderName] = subcats[orderName];
        });
        // Append any remaining subcategories not in the predefined order
        Object.keys(subcats)
            .filter(name => !(name in ordered))
            .sort((a, b) => a.localeCompare(b))
            .forEach(name => (ordered[name] = subcats[name]));
        all[cat] = ordered;
    }

    return { QUICK_ACCESS: quick, ALL_TOOLS: all };
}

export const baseToolRegistry: [
    { QUICK_ACCESS: ToolConfig[] },
    { ALL_TOOLS: Record<string, Record<string, ToolConfig[]>> }
] = [
    { QUICK_ACCESS: buildStructuredRegistry().QUICK_ACCESS },
    { ALL_TOOLS: buildStructuredRegistry().ALL_TOOLS }
];

// Convenience accessors for the structured shape
export const getQuickAccessTools = (): ToolConfig[] => baseToolRegistry[0].QUICK_ACCESS;
export const getAllToolsStructured = (): Record<string, Record<string, ToolConfig[]>> => baseToolRegistry[1].ALL_TOOLS;

// Compatibility: provide a flat registry for existing hooks/components
export function getFlatToolRegistry(): ToolRegistry {
    return flatToolRegistryMap;
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