# StirlingPDF rewrite

This is the development repository for the new StirlingPDF backend. With the power of JS, WASM & GO this will provide almost all functionality SPDF can do currently directly on the client. For automation purposes this will still provide an API to automate your workflows.

![alt text](https://media.discordapp.net/attachments/1174462312904663120/1272615545719619674/image.png?ex=6700d5d6&is=66ff8456&hm=3e36a0c2214f2de07ba4ff4833f86aed5f2f3447f61fe80f5396654b202139b8&=&format=webp&quality=lossless)
This image is here to reflect current progress and will be updated accordingly.

## Try the new API!

[![Run in Postman](https://run.pstmn.io/button.svg)](https://documenter.getpostman.com/view/30633786/2s9YRB1Wto)

## Understanding Workflows

Workflows define how to apply operations to a PDF, including their order and relations with eachother.

Workflows can be created via the web-ui and then exported or, if you want to brag a bit, you can create the JSON object yourself.

### Basics

To create your own, you have to understand a few key features first. You can also look at more examples our github repository.

```json
{
  "outputOptions": {
    "zip": false
  },
  "actions": [
    {
      "type": "extract",
      "values": {
        "pageIndexes": [0, 2]
      },
      "actions": []
    }
  ]
}
```

The workflow above will extract the first (p\[0\]) and third (p\[2\]) page of the document.

You can also nest workflows like this:

```json
{
  "outputOptions": {
    "zip": false
  },
  "actions": [
    {
      "type": "extract",
      "values": {
        "pageIndexes": [0, 2]
      },
      "actions": [
        {
          "type": "impose",
          "values": {
            "nup": 2, // 2 pages of the input document will be put on one page of the output document.
            "format": "A4L" // A4L -> The page size of the Ouput will be an A4 in Landscape. You can also use other paper formats and "P" for portrait output. 
          },
          "actions": []
        }
      ]
    }
  ]
}
```

If you look at it closely, you will see that the extract operation has another nested operation of the type impose. This workflow will produce a PDF with the 1st and 2nd page of the input on one single page.

### Advanced

If that is not enought for you usecase, there is also the possibility to connect operations with eachother.

You can also do different operations to produce two different output PDFs from one input.

If you are interested in learning about this, take a look at the Example workflows provided in the repository, ask on the discord, or wait for me to finish this documentation.

## Features

### Rewrite Roadmap

* [X] Client side PDF-Manipulation
* [X] Workflows
* [X] passportjs backend (auth)
* [ ] Auth in frontend
* [ ] Feature equivalent with S-PDF v1
* [ ] Stateful UI
* [ ] Node based editing of Workflows

### Functions

Current functions of spdf and their progress in this repo.

#### PDF Functions

| Status | Feature                                            | Description |
| ------ | -------------------------------------------------- | ----------- |
| ✔️   | arrange                                            |             |
| ✔️   | extract                                            |             |
| ✔️   | impose                                             |             |
| ✔️   | merge                                              |             |
| ✔️   | remove blank                                       |             |
| ✔️   | remove                                             |             |
| ✔️   | rotate pages                                       |             |
| ✔️   | scale content                                      |             |
| ✔️   | scale pages                                        |             |
| ✔️   | split by preset                                    |             |
| ✔️   | split by index                                     |             |
| ✔️   | update metadata                                    |             |
| ✔️   | pdf to single large page                           |             |
| 🚧    | remove annotations                                 |             |
| 🚧    | flatten                                            |             |
| 🚧    | overlay pdfs                                       |             |
| 🚧    | compress                                           |             |
| 🚧    | change permissions                                 |             |
| 🚧    | pdf to pdf/a                                       |             |
| 🚧    | add page numbers                                   |             |
| 🚧    | add image                                          |             |
| 🚧    | add watermark                                      |             |
| 🚧    | auto rename                                        |             |
| 🚧    | add stamp                                          |             |
| ❌     | repair                                             |             |
| ❌     | sign with cert                                     |             |
| ❌     | ocr                                                |             |
| ❌     | auto split by size/count (+split by preset)        |             |
| ❌     | split pdfs by sections/chapters (+split by preset) |             |
| ❌     | adjust colors/contrast                             |             |
| ❌     | adjust colors/contrast                             |             |
| ❌     | sanitize                                           |             |
| ❌     | sign                                               |             |
| ❌     | basic text editing                                 |             |
| ❌     | auto redact                                        |             |

#### Generic Filetype (Filetypes are not supported by workflows yet. Coming Soon™)

| Status | Feature             | Description |
| ------ | ------------------- | ----------- |
| 🚧    | image to pdf        |             |
| 🚧    | pdf to image        |             |
| 🚧    | extract images      |             |
| 🚧    | show javascript     |             |
| ❌     | convert file to pdf |             |
| ❌     | pdf to word         |             |
| ❌     | pdf to presentation |             |
| ❌     | pdf to rtf          |             |
| ❌     | pdf to html         |             |
| ❌     | pdf to xml          |             |
| ❌     | url/website to pdf  |             |
| ❌     | markdown to pdf     |             |
| ❌     | pdf to csv          |             |
| ❌     | get all info        |             |
| ❌     | compare             |             |

✔️: Done, 🚧: Possible with current Libraries, ❌: Planned Feature

## Contribute

For initial instructions look at [CONTRIBUTE.md](./CONTRIBUTE.md)