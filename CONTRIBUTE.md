# Contribute

This file should introduce you with the concepts and tools used in this project.

## PDF Library Docs
- [pdf-lib](https://pdf-lib.js.org) - js
- [pdfcpu](https://pdfcpu.io) - go-wasm

## Adding a PDF Operation
StirlingPDF aims to support as many types of operations as possible, including some that cannot be executed in the client. Because of this, we have decided to move some of the shared functionality into it's own node module so that it can be shared by both client and server.

### Adding a shared (server + client) operation
1. Add the code for the operation to a new file in the [functions folder](/shared-operations/functions/). 

> **NOTE:** all functions in these files use **dependency injection** (see existing functions for examples).
> 
> **Explanation:** Because the server and client import libraries in different ways, we import the library as needed in the wrapper module, then pass into the a operation function as a parameter.

2. Now that we have the function code, we need to tell the other modules that it exists. Edit the [server operations](/server-node/public/pdf-operations.js) and the [client operations](/client-ionic/src/utils/pdf-operations.js) files to add your new operation! (Try to follow existing patterns where possible, keep the added operations in alphabetical order in the files).

### Adding a server only operation
> WIP