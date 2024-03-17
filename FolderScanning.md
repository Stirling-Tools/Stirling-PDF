## User Guide for Local Directory Scanning and File Processing

### Setting Up Watched Folders:
- Create a folder where you want your files to be monitored. This is your 'watched folder'.
- The default directory for this is `./pipeline/watchedFolders/`
- Place any directories you want to be scanned into this folder, this folder should contain multiple folders each for their own tasks and pipelines.

### Configuring Processing with JSON Files:
- In each directory you want processed (e.g `./pipeline/watchedFolders/officePrinter`), include a JSON configuration file.
- This JSON file should specify how you want the files in the directory to be handled (e.g., what operations to perform on them) which can be made, configured and downloaded from Stirling-PDF Pipeline interface.r

### Automatic Scanning and Processing:
- The system automatically checks the watched folder every minute for new directories and files to process.
- When a directory with a valid JSON configuration file is found, it begins processing the files inside as per the configuration.

### Processing Steps:
- Files in each directory are processed according to the instructions in the JSON file.
- This might involve file conversions, data filtering, renaming files, etc. If the output of a step is a zip, this zip will be automatically unzipped as it passes to next process.

### Results and Output:
- After processing, the results are saved in a specified output location. This could be a different folder or location as defined in the JSON file or the default location `./pipeline/finishedFolders/`.
- Each processed file is named and organized according to the rules set in the JSON configuration.

### Completion and Cleanup:
- Once processing is complete, the original files in the watched folder's directory are removed.
- You can find the processed files in the designated output location.

### Error Handling:
- If there's an error during processing, the system will not delete the original files, allowing you to check and retry if necessary.

### User Interaction:
- As a user, your main tasks are to set up the watched folders, place directories with files for processing, and create the corresponding JSON configuration files.
- The system handles the rest, including scanning, processing, and outputting results.
