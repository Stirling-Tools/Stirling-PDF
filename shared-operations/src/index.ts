
import { arrangePages, ArrangePagesParamsType } from './functions/arrangePages'
import { extractPages, ExtractPagesParamsType } from "./functions/extractPages";
import { impose, ImposeParamConstraints, ImposeParamsType } from "./functions/impose";
import { mergePDFs, MergeParamsType } from './functions/mergePDFs';
import { removeBlankPages, RemoveBlankPagesParamsType } from "./functions/removeBlankPages";
import { removePages, RemovePagesParamsType } from "./functions/removePages";
import { rotatePages, RotateParamsType } from './functions/rotatePages';
import { scaleContent, ScaleContentParamsType} from './functions/scaleContent';
import { scalePage, ScalePageParamsType } from './functions/scalePage';
import { splitPagesByPreset, SplitPageByPresetParamsType } from './functions/splitPagesByPreset';
import { splitPdfByIndex, SplitPdfByIndexParamsType } from './functions/splitPdfByIndex';
import { updateMetadata, UpdateMetadataParams } from "./functions/updateMetadata";
import { FieldConstraint, RecordConstraint } from '@stirling-pdf/shared-operations/src/dynamic-ui/OperatorConstraints'
import { PdfFile } from "./wrappers/PdfFile";

import { Override, ValuesType } from '../declarations/TypeScriptUtils'

// Import injected libraries here!

const toExport = {
    /*arrangePages,
    extractPages,*/
    Impose: {exec: impose, spec: ImposeParamConstraints},
    /*mergePDFs,
    removeBlankPages,
    removePages,
    rotatePages,
    scaleContent,
    scalePage,
    splitPagesByPreset,
    splitPdfByIndex,
    updateMetadata,*/
}
export default toExport;

type OperatorsBaseType = typeof toExport;
export type OperatorsType = Override<OperatorsBaseType, {
    Impose: {
        exec: (params: ImposeParamsType) => Promise<PdfFile>;
        spec: RecordConstraint;
    };
}>;

export type OperatorType = ValuesType<OperatorsType>;

export type OperatorParametersType = {
    /*arrangePages: ArrangePagesParamsType
    extractPages: ExtractPagesParamsType;*/
    Impose: ImposeParamsType;
    /*mergePDFs: MergeParamsType;
    removeBlankPages: RemoveBlankPagesParamsType;
    removePages: RemovePagesParamsType;
    rotatePages: RotateParamsType;
    scaleContent: ScaleContentParamsType;
    scalePage: ScalePageParamsType;
    splitPagesByPreset: SplitPageByPresetParamsType;
    splitPdfByIndex: SplitPdfByIndexParamsType;
    updateMetadata: UpdateMetadataParams;*/
}
