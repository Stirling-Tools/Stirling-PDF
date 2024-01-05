
import { PdfFile } from "../wrappers/PdfFile.js";
import { splitPagesByIndex } from "./common/splitPagesByIndex.js";
import { detectEmptyPages } from "./common/detectEmptyPages.js";
import { detectQRCodePages } from "./common/detectQRCodePages.js";

export interface SplitPageByPresetParamsType {
    file: PdfFile;
    type: "BAR_CODE"|"QR_CODE"|"BLANK_PAGE";
    whiteThreashold?: number;
}
export async function splitPagesByPreset(params: SplitPageByPresetParamsType): Promise<PdfFile[]> {
    const { file, type, whiteThreashold } = params;

    console.log("File: ", file);

    let splitAtPages: number[];
    switch (type) {
    case "BAR_CODE":
        // TODO: Implement
        throw new Error("This split-type has not been implemented yet");

    case "QR_CODE":
        splitAtPages = await detectQRCodePages(file);
        break;

    case "BLANK_PAGE":
        if (!whiteThreashold)
            throw new Error("White threshold not provided");
        splitAtPages = await detectEmptyPages(file, whiteThreashold);
        break;
    
    default:
        throw new Error("An invalid split-type was provided.");
    }

    console.debug("Split At Pages: ", splitAtPages);

    const newFiles = await splitPagesByIndex(file, splitAtPages);
    for (let i = 0; i < newFiles.length; i++) {
        newFiles[i].filename += "_split-"+i;
    }
    return newFiles;
}
