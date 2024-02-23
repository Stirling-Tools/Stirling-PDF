import fs from "fs";
import path from "path";
import {
    CompileTimeFunctionArgs,
    CompileTimeFunctionResult,
  } from "vite-plugin-compile-time"

function getAllJsFiles(directory) {
    const jsFiles = [];

    // Synchronously read the contents of the directory
    const files = fs.readdirSync(directory);

    // Iterate through the files and filter out the JavaScript files
    files.forEach((file) => {
        const filePath = path.join(directory, file)
        const isJsFile = fs.statSync(filePath).isFile() && path.extname(filePath) === '.ts';

        if (isJsFile) {
            const baseName = path.basename(filePath, '.ts');
            if(baseName != "index") {
                jsFiles.push(baseName);
            }
        }
    });

    return jsFiles;
}
export default async (
    args: CompileTimeFunctionArgs,
  ): Promise<CompileTimeFunctionResult> => {
    const jsFiles = getAllJsFiles(__dirname + "/../functions/");
    return {
        data: jsFiles,
        // Trigger rebuild when watched files change
        watchFiles: [__filename],
    }
  }