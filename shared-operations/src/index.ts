
import { 
    sortPagesWithPreset, SortPagesWithPresetParamsType,
    rearrangePages, RearrangePagesParamsType,
    selectPages, SelectPagesParamsType,
    removePages, RemovePagesParamsType,
    removeBlankPages, RemoveBlankPagesParamsType
} from "./functions/subDocumentFunctions";
import { impose, ImposeParamsBaseType, ImposeParamsType } from "./functions/impose";
import { mergePDFs, MergeParamsType } from './functions/mergePDFs';
import { rotatePages, RotateParamsType } from './functions/rotatePages';
import { scaleContent, ScaleContentParamsType} from './functions/scaleContent';
import { scalePage, ScalePageParamsType } from './functions/scalePage';
import { splitOn, SplitOnParamsType } from './functions/splitOn';
import { splitPDF, SplitPdfParamsType } from './functions/splitPDF';
import { updateMetadata, UpdateMetadataParams } from "./functions/updateMetadata";
import { PdfFile } from "./wrappers/PdfFile";

import { Override } from '../declarations/TypeScriptUtils'

// Import injected libraries here!

const toExport = {
    sortPagesWithPreset, rearrangePages, selectPages, removePages, removeBlankPages,
    impose,
    mergePDFs,
    rotatePages,
    scaleContent,
    scalePage,
    splitOn,
    splitPDF,
    updateMetadata,
}
export default toExport;

export type OperationsParametersBaseType = {
    sortPagesWithPreset: SortPagesWithPresetParamsType;
    rearrangePages: RearrangePagesParamsType;
    selectPages: SelectPagesParamsType;
    removePages: RemovePagesParamsType;
    removeBlankPages: RemoveBlankPagesParamsType;
    impose: ImposeParamsBaseType;
    mergePDFs: MergeParamsType;
    rotatePages: RotateParamsType;
    scaleContent: ScaleContentParamsType;
    scalePage: ScalePageParamsType;
    splitOn: SplitOnParamsType;
    splitPDF: SplitPdfParamsType;
    updateMetadata: UpdateMetadataParams;
}

export type OperationsBaseType = typeof toExport;

// Overide fields in the type of toExport, with the given fields and types. This seems to magically work!
export type OperationsType = Override<OperationsBaseType, {
    impose: (params: ImposeParamsType) => Promise<PdfFile>;
}>;

export type OperationsParametersType = Override<OperationsParametersBaseType, {
    impose: ImposeParamsType;
}>;
