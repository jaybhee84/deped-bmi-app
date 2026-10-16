// "ELIOT" / "eliot" -> "Eliot"; "DELA CRUZ" -> "Dela Cruz"; "grade 6 - ELIOT" ->
// "Grade 6 - Eliot". Names and class labels use first-letter capitals only.
export function titleCaseName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());
}
