# Contribute

This file should introduce you with the concepts and tools used in this project.

## PDF Library Docs
- [pdf-lib](https://pdf-lib.js.org) - js
- [pdfcpu](https://pdfcpu.io) - go-wasm

## Adding a PDF Operation
StirlingPDF aims to support as many types of operations as possible, including some that cannot be executed in the client. Because of this, we have decided to move some of the shared functionality into it's own node module so that it can be shared by both client and server.

### Adding a shared (server + client) operation
1. Add the code for the operation to a new file in the [functions folder](/shared-operations/functions/). 

> **NOTE:** many of the functions in these files use **dependency injection** (see impose for an example).
> 
> **Explanation:** Because some libraries need to be imported in different ways. We import the library as needed in the ```pdf-operations.js``` files, then pass the required library objects into the operation function as a parameter.

2. Now that we have the function code, we need to tell the other modules that it exists. Edit the [server operations](/server-node/src/pdf-operations.js) and the [client operations](/client-ionic/src/utils/pdf-operations.ts) files to add your new operation! (Try to follow existing patterns where possible, keep the added operations in alphabetical order in the files).
   
3. If you added a wrapper function to the [client operations](/client-ionic/src/utils/pdf-operations.ts) file, you will also need to add the TypeScript declarations to the [declaration](/client-ionic/declarations/shared-operations.d.ts) file. See the other module declarations for examples.

### Adding a server only operation
> WIP