# Contribute

This file should introduce you with the concepts and tools used in this project.

## Basic Setup

- Install/Update **Node (v22.2.0, [nvm](https://github.com/coreybutler/nvm-windows))** & NPM(>10.2.1)
- To install all dependecies `npm run update-all-dependencies` (in [root](/))
- To test your current setup and boot a complete install of spdf v2 run `npm run dev-all` (in [root](/))

## Nomenclature

- API - Probably refers to the “normal“ API of spdf v2 without workflows unless otherwise noted.
- Workflow - Either the express-endpoint for running workflows or the user defined workflow-json
- Action - A sub-element of a workflow describing what operation should run on the inputted file / output of the last action.
- Operation - The actual function that will run on the pdf, including parameters.
- Operator - The actual code/implementation of the Operation (e.g. impose.ts) OR The parent class of every Operator.
- Validator - A function that makes sure things are as they should be. Every Operator must have one.
- Decorator - Explanations and Human Readable names of fields, these will be displayed in the frontend and used to provide better errors for the (workflow-)API

## Folder structure

- (abandoned) client-ionic- An old test of 
- client-tauri - The frontend
- (abandoned) client-vanilla - The initial test to see if it is possible to run Operators in the browser environment of the user in addition to having a backend. Will be removed once development on the fronend/client-tauri has started.
- server-node - Functions and Classes that are shared between frontend and backend e.g. Operators

## Adding a PDF Operation
StirlingPDF aims to support as many types of operations as possible, including some that cannot be executed in the client. Because of this, we have decided to move some of the shared functionality into it's own node module so that it can be shared by both client and server.

## PDF Library Docs
- [pdf-lib](https://pdf-lib.js.org) - js
- [pdfcpu](https://pdfcpu.io) - go-wasm
- [opencv-wasm](https://www.npmjs.com/package/opencv-wasm) - ?-wasm
- [mozilla's pdfjs-dist/pdf.js](https://www.npmjs.com/package/pdfjs-dist) - js