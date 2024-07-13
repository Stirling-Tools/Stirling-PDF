import fs from "fs";
import path from "path";
import {
    CompileTimeFunctionArgs,
    CompileTimeFunctionResult,
  } from "vite-plugin-compile-time"

  async function obtainOperatorInformation(directory) {
    const jsFiles = [];

    // Synchronously read the contents of the directory
    const files = fs.readdirSync(directory);

    // Iterate through the files and filter out the JavaScript files
    for (const file of files) {
        const filePath = path.join(directory, file)
        const isJsFile = fs.statSync(filePath).isFile() && path.extname(filePath) === '.ts';

        if (isJsFile) {
            const baseName = path.basename(filePath, '.ts');
            if(baseName != "index" && !baseName.endsWith(".schema")) {
                //TODO: Extract more info from operators. Currently not possible see: https://github.com/egoist/vite-plugin-compile-time/issues/25
                
                jsFiles.push({
                    basename: baseName
                });
            }
        }
    }

    return jsFiles;
}
export default async (
    args: CompileTimeFunctionArgs,
  ): Promise<CompileTimeFunctionResult> => {
    const jsFiles = await obtainOperatorInformation(__dirname + "/../functions/");
    return {
        data: jsFiles,
        // Trigger rebuild when watched files change
        watchFiles: [__filename],
    }
  }