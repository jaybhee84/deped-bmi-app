# Printing guide

Every printable form or report in this app follows the rules below. SBFP Form 3
is the reference implementation:

- Screen and print markup: `src/components/SbfpForms.jsx` (the `form === "form3"` branch)
- Stylesheet: `src/components/Form3Sheet.css` (it includes the `@media print` block)
- Paging and Excel export: `src/utils/exportSbfpForm3Excel.js`

Copy that pattern for a new print instead of starting over.

## 1. Always go through the Print Preview

- Print with `requestPrint` from `usePrintPreview()`
  (`src/components/PrintPreview/PrintPreviewContext.jsx`). Do not call
  `window.print()`, open popups or add another print path.
- Pass the on-screen sheets and their stylesheet. Import the CSS twice: once
  normally and once as `?raw`.

  ```jsx
  import sheetCss from "./MySheet.css?raw";
  import "./MySheet.css";

  requestPrint({
    element: pagesRef.current, // wraps every printable page
    css: sheetCss,
    orientation: "landscape",  // or "portrait"
    margin: 0.25,              // inches
    title: `My Form - ${month} SY ${schoolYear}`,
  });
  ```

- The paper is always **Folio (8.5 × 13 in)** (`PRINT_PAPER`). Lay the page out for Folio.
- The preview selects the **Windows default printer** (`electron/printing.js`
  reads it from the registry because Electron often reports none). Never
  preselect a different printer.
- On Windows, the print job (`electron/printing.js`) prints the preview PDF with
  SumatraPDF from `pdf-to-printer`, using the **driver's paper code**
  (`paperkind`, for example 14 for 8.5 x 13 in). This is needed because:
  - Drivers such as the EPSON L-series ignore a custom page size and print on
    their default paper (A4), which cuts off a Folio page.
  - SumatraPDF does not recognize paper *names* such as "8.5 x 13 in".
  - SumatraPDF rejects `1x` (copies) and `noscale`, so the job sends only
    non-default settings.
  - The driver ignores a `landscape` request. Before printing, each landscape
    page is drawn turned 90° clockwise onto an upright page with `pdf-lib`, so
    the form's left edge (the DepEd seal) is at the top of the sheet. The
    printer prints the top first, so the left side comes out first. Turned the
    other way, the OK sa DepEd side came out first. The turn is drawn into the
    page itself, not set as a `/Rotate` flag.
  - For a printer that feeds the other way, the Print Preview has **Flip
    landscape pages**. It is saved on that computer (`secureStorage`).
  - Every print uses this path. A new print needs no extra printer code: set the
    document's `orientation` and it is handled.
- Anything on screen that must not print (page tags, helper text, buttons) gets
  the `no-print` class. The preview removes it from the printed copy.

## 2. What is on screen is what prints

- The on-screen preview is the printed form. Build the sheet once and print that
  same markup. Do not maintain a second HTML layout for print.
- Render one element per printed page (`.form3-page`). Each page is complete on
  its own and repeats the full header and the signatories. Do not let a long
  list run on as one continuous table.
- Set the page break in CSS:

  ```css
  @media print {
    .my-page { break-after: page; }
    .my-page:last-child { break-after: auto; }
    .my-table tr, .my-footer { break-inside: avoid; }
  }
  ```

## 3. Paging rows

- Choose a fixed number of rows per page and use the **same number on screen,
  in print and in the Excel export**, so the page breaks match. Form 3 uses 35.
- Test that a full page fits before choosing the number. Render full pages to
  a Folio PDF with Electron's `printToPDF` and count the pages.
- Keep a group (such as a class section) together. If it does not fit in the
  space left, start it on a new page. If a group is longer than a whole page,
  continue it on the next page and repeat its heading. See `paginateForm3Rows`.
- Number the learners. Numbering restarts for each section and continues
  across page breaks.

## 4. Look and layout

Follow the official DepEd template first. Polish it, but do not invent a
different form.

- **Header:** form label at top left (for example `SBFP Form 3 (2026)`), the
  DepEd seal on the left (`src/images/deped.png`), any program logo on the right
  (for example OK sa DepEd, `src/assets/ok.png`), and the centered title lines
  between them.
- **Details:** label and value pairs (Region, SDO, District, School, School ID,
  Grade) in two columns, with each value on an underline.
- **Table:** Arial, a thick black outer border, thin black inner lines, and a
  thicker line where a group ends (for example the end of each week).
- **Footer:** "Prepared by" and "Approved by" with the name in bold on a
  signature line and the position below it. Then any legends.
- **Text sizes:** body text 10px (names, details, footer). Titles 16, 14 and 13px.
  Printed rows are about 13px tall.

## 5. Print colors: black only

Color inkjets (the EPSON L-series used in schools) mix gray and pale tints from
color inks, and the result prints green-looking. In `@media print`:

- Every line is **pure black** (`#000`). Do not use gray borders.
- No background tints on table rows or headings. Print them on white.
- Text is black. Only the logos stay in color.

Soft grays and tints are fine on screen.

## 6. Data and defaults

- Fill in everything the app already knows, so the user types as little as possible:
  - Region: `Region IX` (SDO Isabela City).
  - District: the school's record. Read the local copy first, then the cloud
    copy (`fetchSchoolById`), the same as the School Information page.
  - School name, school ID and SDO: from the current school.
  - Month: a dropdown that defaults to the current month, printed in capitals.
- Signatories are edited in a **Signatories** dialog (`Modal`): Prepared by
  name and position, then Approved by name and position. Print names in
  capitals but keep degrees after the comma as typed (`form3SignatoryName`:
  `JOCELYN R. BUENAVENTURA, Ed.D`).
- An input may be left blank on purpose (for example Starting week). Respect the
  blank and do not put the default back in.
- Save form inputs with `secureStorage`, the same as the other SBFP form details.

## 7. Excel export (when the form has one)

**The Excel file must match the screen and the print preview.** That covers the
same learners, the same values in the same units, the same blank defaults, the
same pages, black lines and Folio paper. Build it from the same data the screen
renders (for example `exportBeneficiaries`), never from a second copy with its
own defaults.

- Never cut off rows. If the template is too short, insert rows and move the
  footer down (see Form 1).
- Set Folio in the sheet: `paperSize: 14`, `fitToPage`, and `fitToWidth: 1`.
- Use the same units as the screen. For example, height is in meters on Form 1.

- Fill the official template in `public/templates/`, and add its file name to
  `BUNDLED_TEMPLATE_FILES` in `electron/main.js`.
- Use the same pages as the print: one worksheet per printed page, named like
  `G2-G6 (2)`.
- ExcelJS notes:
  - Template cells share style objects, so assign a new `cell.style`. Do not
    mutate `cell.font` in place.
  - A sheet copied with `sheet.model = …` loses its merged cells. Merge them again.

## Checklist for a new print

- [ ] Prints through `requestPrint` on Folio paper, using the default printer.
- [ ] One complete page element per printed page, with the header and
      signatories on every page.
- [ ] The same rows per page on screen, in print and in Excel. A full page has
      been tested to fit.
- [ ] Groups stay together, and learners are numbered.
- [ ] Black lines and no tints in `@media print`.
- [ ] Known values are filled in by default. Signatories are editable.
- [ ] Screen-only parts have `no-print`.
