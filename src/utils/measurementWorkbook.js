// Excel limits sheet names to 31 characters and disallows these characters.
export function sectionSheetName(section, usedNames) {
  const base = String(section).replace(/[\\/*?:\[\]]/g, '-').replace(/^'+|'+$/g, '').trim() || 'Section';
  let name = base.slice(0, 31);
  let suffix = 2;
  while (usedNames.has(name.toLowerCase())) {
    const ending = ` (${suffix++})`;
    name = base.slice(0, 31 - ending.length) + ending;
  }
  usedNames.add(name.toLowerCase());
  return name;
}

export function workbookRows(workbook, cellText, normalizeRow) {
  const rows = [];
  for (const sheet of workbook.worksheets) {
    const headers = [];
    sheet.getRow(1).eachCell((cell, col) => { headers[col] = cellText(cell.value); });
    sheet.eachRow((row, rowNo) => {
      if (rowNo === 1) return;
      const raw = {};
      headers.forEach((header, col) => { if (header) raw[header] = row.getCell(col).value; });
      const values = normalizeRow(raw);
      if (Object.values(values).some(value => value !== '')) {
        rows.push({ rowNo: `${sheet.name}, row ${rowNo}`, values });
      }
    });
  }
  return rows;
}
