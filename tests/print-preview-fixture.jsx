// Fixture for tests/electron-print-preview.cjs: an NS Report sheet printed as
// displayed, and a landscape summary document.
import { useRef } from "react";
import { createRoot } from "react-dom/client";
import NsReportSheet from "../src/components/NsReportSheet";
import nsReportSheetCss from "../src/components/NsReportSheet.css?raw";
import { PrintPreviewProvider, usePrintPreview } from "../src/components/PrintPreview/PrintPreviewContext";
import { buildNsReportClasses } from "../src/utils/nsReportModel";
import { nutritionSummaryDocument } from "../src/utils/printDocuments";

// 70 classes: a whole school printed at once must stay well under the
// print service's document size limit.
const students = Array.from({ length: 70 * 20 }, (_, i) => ({
  id: i, name: `LEARNER ${String(i + 1).padStart(2, "0")}, VERY LONG GIVEN NAMES FOR ONE LINE`,
  birthdate: "2016-03-07", sex: i % 2 ? "F" : "M", section: i < 30 ? "Grade 4 - Poliquit" : `Grade 5 - Class ${String(Math.floor(i / 20)).padStart(2, "0")}`,
  rec: { weight: 30, date: "2026-06-09" }, heightCm: 140, bmi: 15.3,
  baz: { label: "Normal" }, haz: { label: "Normal" },
}));
const classes = buildNsReportClasses(students, () => "ROSALIE E. POLIQUIT");
const stats = { enrolment: 10, weighed: 9, takenHeight: 9, bmi: { Normal: 9 }, hfa: { Normal: 9 } };

function Fixture() {
  const { requestPrint } = usePrintPreview();
  const pages = useRef(null);
  return (
    <>
      <button id="open-ns" onClick={() => requestPrint({ element: pages.current, css: nsReportSheetCss })}>NS</button>
      <button id="open-summary" onClick={() => requestPrint(nutritionSummaryDocument({
        meta: { schoolName: "Test School", sy: "2026-2027", period: "Baseline", date: "today" },
        rows: [{ grade: "Grade 4", M: stats, F: stats, Total: stats }], grand: { M: stats, F: stats, Total: stats },
      }))}>Summary</button>
      <div className="nsr-pages" ref={pages}>
        {classes.map((c) => <NsReportSheet key={c.section} reportClass={c} schoolName="Isabela East Central Elementary School" address="Isabela City, Basilan" period="Baseline" schoolYear="2026–2027" />)}
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<PrintPreviewProvider><Fixture /></PrintPreviewProvider>);
