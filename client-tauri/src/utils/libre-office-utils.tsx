
import { readBinaryFile, writeBinaryFile, removeDir, BaseDirectory } from '@tauri-apps/api/fs';
import { PdfFile, fromUint8Array } from '@stirling-pdf/shared-operations/wrappers/PdfFile'
import { runShell } from './tauri-wrapper';

export async function fileToPdf(byteArray: Uint8Array, filename: string): Promise<PdfFile> {
    const randUuid = crypto.randomUUID();
    const tempDir = "StirlingPDF/"+randUuid;
    const srcFile = tempDir+"/"+filename;

    await writeBinaryFile(srcFile, byteArray);
    await writeBinaryFile(srcFile, new Uint8Array([]), { dir: BaseDirectory.Temp });

    const messageList: string[] = [];
    await runShell("libreoffice-convert", ["--headless","--convert-to","pdf",srcFile,"--outdir",tempDir], (message, stream) => {
        if (stream === "stdout") {
            messageList.push(message);
        }
        console.debug(`${stream}, ${randUuid}: ${message}`);
    });
    const lastMessage = messageList[messageList.length-1]
    const outputFilePath = lastMessage.split(" -> ")[1].split(".pdf")[0]+".pdf";
    const outputFilePathSplit = outputFilePath.toString().split("[\\/]")
    const outputFileName = outputFilePathSplit[outputFilePathSplit.length-1];
    const outputBytes = await readBinaryFile(outputFilePath);

    await removeDir(tempDir);

    return fromUint8Array(outputBytes, outputFileName);
}

export async function isLibreOfficeInstalled() {
    const messageList: string[] = [];
    try {
        await runShell("libreoffice-version", ["--version"], (message, stream) => {
            if (stream === "stdout") {
                messageList.push(message);
            }
        });
    } catch (error) {
        return false;
    }
    console.log("messageList", messageList)
    const result = messageList[0].match("LibreOffice ([0-9]+\.){4}.*");
    return result ? true : false;
}
