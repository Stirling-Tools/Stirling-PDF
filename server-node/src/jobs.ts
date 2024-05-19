import { traverseOperations } from '@stirling-pdf/shared-operations/src/workflow/traverseOperations';
import { PdfFile, RepresentationType } from '@stirling-pdf/shared-operations/src/wrappers/PdfFile';
import { JoiPDFFileSchema } from '@stirling-pdf/shared-operations/src/wrappers/PdfFileJoi';
import 'dotenv/config';
import fs from 'fs';
import path from "path";
import toml from 'toml';

const jobsDir = process.env.JOBS_DIR;

// TODO: Also remove watched folders
const watchedFolders: { 
    [folderName: string]: Job
} = {};

if(jobsDir)
    setupJobs(jobsDir);

function setupJobs(jobsDir: string) {
    if(!fs.existsSync(jobsDir)) {
        console.log("jobs dir does not exist. creating one...");
        fs.mkdirSync(jobsDir);
    }
    
    fs.watch(jobsDir, {}, (e, f) => {
        if(f === null) return;

        if(f === "jobs.toml") {
            handleJobsToml("jobs.toml", jobsDir);
        }
    })
    
    fs.readdir(jobsDir, (err, files) => {
        if (files.includes("jobs.toml")) {
            handleJobsToml("jobs.toml", jobsDir);
        }
        else {
            console.log("jobs.toml is not present, if you want to use jobs please configure it");
        }
    });
}

interface Job {
    type: string
}

type cronString = string;

interface FolderJob extends Job {
    trigger: "FILE_CHANGE" | "START_FILE_DELETION" | cronString,
    delay: number | undefined,
    respectFolderStructure: boolean | undefined,
    enableLogsDir: boolean | undefined,
    keepOriginals: boolean | undefined,
    indicateStatus: boolean | undefined,
}

function handleJobsToml(jobsFile: string, jobsDir: string) {
    console.log("jobs.toml was updated.");
    fs.readFile(path.join(jobsDir, jobsFile), (err, data) => {
        const jobsConfig = toml.parse(data.toString());
        const jobs: { [key: string]: Job} = jobsConfig.jobs;

        for (const jobName in jobs) {
            const job = jobs[jobName];
            switch (job.type) {
                case "folder":
                    setupFolderJob(jobName, job as FolderJob, jobsDir);
                    break;
                default:
                    console.error(`job-type ${job.type} of ${jobName} is not implemented`);
                    break;
            }
        }
    })
}

const watchedWritingFiles: { [path: string]: NodeJS.Timeout } = {};

function setupFolderJob(jobName: string, job: FolderJob, jobsDir: string) {
    const jobFolder = path.join(jobsDir, jobName, "/");

    if(watchedFolders[path.join(jobFolder, "in/")]) {
        return;
    }

    watchedFolders[path.join(jobFolder, "in/")] = job;

    if(!fs.existsSync(jobFolder)) {
        fs.mkdirSync(jobFolder);

        if(!fs.existsSync(path.join(jobFolder, "workflow.json"))) {
            fs.writeFileSync(path.join(jobFolder, "workflow.json"), "{}");
        }

        if(!fs.existsSync(path.join(jobFolder, "in/"))) {
            fs.mkdirSync(path.join(jobFolder, "in"));
        }

        if(!fs.existsSync(path.join(jobFolder, "out/"))) {
            fs.mkdirSync(path.join(jobFolder, "out"));
        }
    }

    // trigger

    switch (job.trigger) {
        case "FILE_CHANGE":
            // TODO: Process files that are already in there
            fs.watch(path.join(jobFolder, "in/"), async (e, f) => {
                if(!f || f == "") return;

                const file = path.parse(f);
                const filePath = path.join(jobFolder, "in/", f);

                if(file.ext != ".pdf") {
                    if(file.ext == ".processing-pdf") {
                        return;
                    }
                    console.log("Non-pdf files aren't supported at the moment.");
                    return;
                }

                if(watchedWritingFiles[filePath]) {
                    clearTimeout(watchedWritingFiles[filePath]);
                }

                console.log("in/", e, f)
                watchedWritingFiles[filePath] = setTimeout(async () => {
                    processSingleFile(file, filePath, jobFolder);
                }, (job.delay || 5) * 1000) 
            });
            break;
    
        default:
            console.error(`The trigger ${job.trigger} for ${jobName} could not be setup.`)
            break;
    }
}

async function processSingleFile(file: path.ParsedPath, filePath: string, jobFolder: string) {
    console.log("Processing file ", file.base);

    try {
        var workflow = JSON.parse(fs.readFileSync(path.join(jobFolder, "workflow.json")).toString());
    } catch (err) {
        if (err instanceof Error) {
            console.error("malformed workflow-json was provided", err.message);
            return;
        } else {
            throw err;
        }
    }

    if(!workflow.actions) {
        console.error("The provided workflow does not contain any actions.");
        return
    }

    console.log("Reading File");

    fs.readFile(filePath, (err, data) => {
        const input: PdfFile = new PdfFile(file.name, new Uint8Array(data), RepresentationType.Uint8Array, file.name);
        
        if(fs.existsSync(filePath))
            fs.renameSync(filePath, filePath + ".processing-pdf");
        else {
            console.log(`${filePath} does not exist anymore. Either it was already processed or it was deleted by the user.`);
            return
        }

        // TODO: Check if file type == inputType for operator

        traverseOperations(workflow.actions, [input], (state) => {
            console.log("State: ", state);
        }).then(async (pdfResults) => {
            console.log("Download");
            //TODO: Write files to fs
            pdfResults.forEach(async pdfResult => {
                fs.writeFile(path.join(jobFolder, "out/", pdfResult.filename + ".pdf"), await pdfResult.uint8Array, (err) => {
                    if(err) console.error(err);
                });
            });
            
            fs.rmSync(filePath + ".processing-pdf");
        }).catch((err) => {
            if(err.validationError) {
                // Bad Request
                console.log(err);
            }
            else if (err instanceof Error) {
                console.error("Internal Server Error", err);
            } else {
                throw err;
            }
        });
    });
}