/*
 * pdfium_all.h — Master include for jextract binding generation.
 *
 * This header aggregates all PDFium public API headers needed by
 * Stirling-PDF. jextract processes this single file to produce Java
 * FFM bindings in the target package.
 *
 * Usage:
 *   jextract \
 *     --output src/gen/java \
 *     --target-package stirling.software.SPDF.pdfium.binding \
 *     -l pdfium \
 *     --header-class-name PdfiumLib \
 *     -I /opt/pdfium/include \
 *     pdfium_all.h
 */

#include "fpdfview.h"
#include "fpdf_edit.h"
#include "fpdf_text.h"
#include "fpdf_annot.h"
#include "fpdf_save.h"
#include "fpdf_flatten.h"
#include "fpdf_doc.h"
#include "fpdf_ppo.h"
#include "fpdf_transformpage.h"
#include "fpdf_structtree.h"
#include "fpdf_formfill.h"
#include "fpdf_attachment.h"
#include "fpdf_signature.h"
#include "fpdf_thumbnail.h"
#include "fpdf_progressive.h"
#include "fpdf_searchex.h"
#include "fpdf_dataavail.h"
#include "fpdf_javascript.h"
#include "fpdf_catalog.h"
#include "fpdf_ext.h"
