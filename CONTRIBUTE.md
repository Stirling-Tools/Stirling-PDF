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

- client-tauri - The frontend - Can be built to web and to a desktop app (with extra functions) using tauri.
- server-node - The backend - Provides extra functionality for the web client.
- shared-operatons - Components (e.g. Operators) that are shared between frontend and backend.

## Adding a PDF Operator

An Operator is either shared by the server and the client or it might have different implementations based on if its executed by the client, desktop-backend or web-backend. The current structure allows us to define where the Operator can be run.

## PDF Library Docs
- [pdf-lib](https://pdf-lib.js.org) - js
- [mozilla's pdfjs-dist/pdf.js](https://www.npmjs.com/package/pdfjs-dist) - js
- [pdfcpu](https://pdfcpu.io) - go-wasm
- [opencv-wasm](https://www.npmjs.com/package/opencv-wasm) - c++-wasm