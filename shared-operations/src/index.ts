
import { arrangePages, ArrangePagesParamsType } from './functions/arrangePages'
import { extractPages, ExtractPagesParamsType } from "./functions/extractPages";
import { impose, ImposeParamsBaseType, ImposeParamsType } from "./functions/impose";
import { mergePDFs, MergeParamsType } from './functions/mergePDFs';
import { removeBlankPages, RemoveBlankPagesParamsType } from "./functions/removeBlankPages";
import { rotatePages, RotateParamsType } from './functions/rotatePages';
import { scaleContent, ScaleContentParamsType} from './functions/scaleContent';
import { scalePage, ScalePageParamsType } from './functions/scalePage';
import { splitPagesByPreset, SplitPageByPresetParamsType } from './functions/splitPagesByPreset';
import { splitPdfByIndex, SplitPdfByIndexParamsType } from './functions/splitPdfByIndex';
import { updateMetadata, UpdateMetadataParams } from "./functions/updateMetadata";
import { PdfFile } from "./wrappers/PdfFile";

import { Override } from '../declarations/TypeScriptUtils'

// Import injected libraries here!

const toExport = {
    arrangePages,
    extractPages,
    impose,
    mergePDFs,
    removeBlankPages,
    rotatePages,
    scaleContent,
    scalePage,
    splitPagesByPreset,
    splitPdfByIndex,
    updateMetadata,
}
export default toExport;

export type OperationsParametersBaseType = {
    arrangePages: ArrangePagesParamsType
    extractPages: ExtractPagesParamsType;
    impose: ImposeParamsBaseType;
    mergePDFs: MergeParamsType;
    removeBlankPages: RemoveBlankPagesParamsType;
    rotatePages: RotateParamsType;
    scaleContent: ScaleContentParamsType;
    scalePage: ScalePageParamsType;
    splitPagesByPreset: SplitPageByPresetParamsType;
    splitPdfByIndex: SplitPdfByIndexParamsType;
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
