# Contribute

This file should introduce you with the concepts and tools used in this project.

## PDF Library Docs
- [pdf-lib](https://pdf-lib.js.org) - js
- [pdfcpu](https://pdfcpu.io) - go-wasm

## Adding a PDF Function

In order to add a PDF-Function there are several files that need to be changed. If the function is on the backend only, or on only on the frontend, you just need to add it to one of the locations. If it is available on both, you need to update both locations. 
Dependency Injection is used to accomodate for different imports across platforms.

Backend functions can have different implementations than their frontend counterparts if neccesary. Otherwise they can just link to their frontend implementation.

Registering functions will also pass them their dependencies for the specific target platform (Node, Browser)

[Traverse Operations](/public/traverseOperations.js)\

### Backend

[Register Functions](/functions.js)\
[Functions Folder](/functions/)

Examples that go in the node-functions folder: server-side-only functions, different implementation for backend

### Frontend

[Register Functions](/public/functions.js)\
[Functions Folder](/public/functions/)

Examples that go in the browser-functions folder: client-side-only functions, shared functions
