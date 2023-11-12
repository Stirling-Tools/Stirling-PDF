
import fs from 'fs';
import os from 'os';
import path from 'path';
import { exec, spawn } from 'child_process'
import { PdfFile, fromUint8Array } from '@stirling-pdf/shared-operations/wrappers/PdfFile'

export async function fileToPdf(byteArray: Uint8Array, filename: string): Promise<PdfFile> {
    const parentDir = path.join(os.tmpdir(), "StirlingPDF");
    fs.mkdirSync(parentDir, {recursive: true});
    const tempDir = fs.mkdtempSync(parentDir+"/");
    const srcFile = path.join(tempDir, filename);
    const randFolderName = path.parse(tempDir).base;

    await writeBytesToFile(srcFile, byteArray);

    const messages = await runLibreOfficeCommand(randFolderName, ["--headless","--convert-to","pdf",srcFile,"--outdir",tempDir]);
    const lastMessage = messages[messages.length-1]
    const outputFilePath = lastMessage.split(" -> ")[1].split(".pdf")[0]+".pdf";
    const outputFileName = path.parse(outputFilePath).base;
    const outputBytes = await readBytesFromFile(outputFilePath);

    fs.rmdirSync(tempDir);

    return fromUint8Array(outputBytes, outputFileName);
}

export function isLibreOfficeInstalled() {
    return new Promise((resolve, reject) => {
        exec("libreoffice --version", (error, stdout, stderr) => {
            if (error) {
                resolve(false);
                return;
            }
            if (stderr) {
                resolve(false);
                return;
            }
            const result = stdout.match("LibreOffice ([0-9]+\.){4}.*");
            resolve(result ? true : false);
        });
    })
}

function writeBytesToFile(filePath: string, bytes: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
        fs.writeFile(filePath, bytes, function(err) {
            if(err) {
                reject(err)
                return;
            }
            resolve();
        });
    });
}

function readBytesFromFile(filePath: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                reject(new Error(`Error reading file: ${err.message}`));
            } else {
                const uint8Array = new Uint8Array(data);
                resolve(uint8Array);
            }
        });
    });
}
  
function runLibreOfficeCommand(idKey: string, args: string[]): Promise<string[]> {
    return new Promise(async (resolve, reject) => {
        const messageList: string[] = [];

        const process = spawn("libreoffice", args);

        process.stdout.on('data', (data) => {
            const dataStr = data.toString();
            console.log(`Progress ${idKey}:`, dataStr);
            messageList.push(dataStr);
        });

        process.stderr.on('data', (data) => {
            console.error(`stderr ${idKey}:`, data.toString());
        });

        process.on('exit', (code) => {
            if (code === 0) {
                resolve(messageList);
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        process.on('error', (err) => {
            reject(err);
        });
        
    });
}
