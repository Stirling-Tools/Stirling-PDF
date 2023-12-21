# StirlingPDF rewrite

This is the development repository for the new StirlingPDF backend. With the power of JS, WASM & GO this will provide almost all functionality SPDF can do currently directly on the client. For automation purposes this will still provide an API to automate your workflows.

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

* [x] Client side PDF-Manipulation
* [x] Workflows
* [ ] Feature equivalent with S-PDF v1
* [ ] Stateful UI
* [ ] Node based editing of Workflows
* [ ] Propper auth using passportjs

### Functions

Current functions of spdf and their progress in this repo.

#### Page Operations
| Status | Feature                  | Description |
| ------ | ------------------------ | ----------- |
| 🚧A    | Merge                    |             |
| 🚧A    | Split                    |             |
| 🚧A    | Organize                 |             |
| 🚧S    | Rotate                   |             |
| 🚧A    | Remove Pages             |             |
| 🚧A    | Multi-Page Layout        |             |
| ❌     | Adjust page size/scale   |             |
| 🚧A    | Auto Split Pages         |             |
| ❌     | Adjust Colours/Contrast  |             |
| ❌     | Crop                     |             |
| 🚧A    | Extract Pages            |             |
| ❌     | PDF to Single large Page |             |


#### Convert
| Status | Feature             | Description |
| ------ | ------------------- | ----------- |
| ❌     | Image to PDF        |             |
| 🚧S    | Convert file to PDF |             |
| ❌     | URL to PDF          |             |
| ❌     | HTML to PDF         |             |
| ❌     | Markdown to PDF     |             |
| ❌     | PDF to Image        |             |
| ❌     | PDF to Word         |             |
| ❌     | PDF to Presentation |             |
| ❌     | PDF to Text/RTF     |             |
| ❌     | PDF to HTML         |             |
| ❌     | PDF to PDF/A        |             |

#### Security
| Status | Feature               | Description |
| ------ | --------------------- | ----------- |
| ❌     | Add Password          |             |
| ❌     | Remove Password       |             |
| ❌     | Change Permissions    |             |
| ❌     | Add Watermark         |             |
| ❌     | Sign with Certificate |             |
| ❌     | Sanitize              |             |
| ❌     | Auto Redact           |             |

#### Miscellaneous
| Status | Feature                     | Description |
| ------ | --------------------------- | ----------- |
| ❌     | OCR                         |             |
| ❌     | Add image                   |             |
| ❌     | Compress                    |             |
| ❌     | Extract Images              |             |
| 🚧S    | Change Metadata             |             |
| 🚧A    | Detect/Split Scanned photos |             |
| ❌     | Sign                        |             |
| ❌     | Flatten                     |             |
| ❌     | Repair                      |             |
| 🚧A    | Remove Blank Pages          |             |
| ❌     | Compare/Diff                |             |
| ❌     | Add Page Numbers            |             |
| ❌     | Auto Rename                 |             |
| ❌     | Get info                    |             |
| ❌     | Show JS                     |             |




✔️: Done, 🚧: Started Developement, ❌: Planned Feature
A: Available in the internal API, S: Available on the node server, C: Available in the client

## Contribute

For initial instructions look at [CONTRIBUTE.md](./CONTRIBUTE.md)



/*
///// CONVERT 2 pdf
file2pdf
url2pdf
html2pdf
md2pdf
image2pdf

///// CONVERT from pdf
pdf2image
flatten
pdf2pdf/a
pdf2word
pdf2presentation
pdf2rtf
pdf2html
pdf2xml

///// SINGLE
merge
rotate
crop
pageNumbers
colours/contrast
addPassword
removePassword
compress
changeMetadata
change Permissions
OCR
sanitise
repair
compare
extract images
signWith certificate
impose
adjust page size/scale
auto rename
getAllInfo
showJS
redact
pdf2singleLargePage

///// SPLITTING
split
auto split
detect/split scanned

///// REARRANGE
- organise pages (remove/re-arrange)
- removePages
- removeBlank
- extractPages

///// ADD OBJECTS
add image
add watermark
sign
*/