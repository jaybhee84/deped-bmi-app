import React from "react";

export default function DataAndTables({
  GRADE_LEVELS,
  gradeSummary,
  grandTotals,
  gradeTotals,
  gradeBg,
}) {
  return (
    <div className="card">
      <h3 className="card-title">Nutritional Status by Grade Level</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="sdo-isolated-table">
          <thead>
            <tr>
              <th>Grade</th>
              <th>Sex</th>
              <th>Normal</th>
              <th>Wasted</th>
              <th>Sev. Wasted</th>
              <th>Overweight</th>
              <th>Obese</th>
              <th>Normal Ht.</th>
              <th>Stunted</th>
              <th>Sev. Stunted</th>
              <th>Tall</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {GRADE_LEVELS.map((grade) => (
              <React.Fragment key={grade}>
                <tr>
                  <td
                    style={{
                      background: gradeBg[grade],
                      fontWeight: 700,
                    }}
                  >
                    {grade}
                  </td>
                  <td>Male</td>
                  <td>{gradeSummary[grade]?.Male.Normal || 0}</td>
                  <td>{gradeSummary[grade]?.Male.Wasted || 0}</td>
                  <td>{gradeSummary[grade]?.Male["Severely Wasted"] || 0}</td>
                  <td>{gradeSummary[grade]?.Male.Overweight || 0}</td>
                  <td>{gradeSummary[grade]?.Male.Obese || 0}</td>
                  <td>{gradeSummary[grade]?.Male["Normal Height"] || 0}</td>
                  <td>{gradeSummary[grade]?.Male.Stunted || 0}</td>
                  <td>{gradeSummary[grade]?.Male["Severely Stunted"] || 0}</td>
                  <td>{gradeSummary[grade]?.Male.Tall || 0}</td>
                  <td>
                    <strong>{gradeSummary[grade]?.Male.Total || 0}</strong>
                  </td>
                </tr>
                <tr>
                  <td style={{ background: gradeBg[grade] }}></td>
                  <td>Female</td>
                  <td>{gradeSummary[grade]?.Female.Normal || 0}</td>
                  <td>{gradeSummary[grade]?.Female.Wasted || 0}</td>
                  <td>{gradeSummary[grade]?.Female["Severely Wasted"] || 0}</td>
                  <td>{gradeSummary[grade]?.Female.Overweight || 0}</td>
                  <td>{gradeSummary[grade]?.Female.Obese || 0}</td>
                  <td>{gradeSummary[grade]?.Female["Normal Height"] || 0}</td>
                  <td>{gradeSummary[grade]?.Female.Stunted || 0}</td>
                  <td>
                    {gradeSummary[grade]?.Female["Severely Stunted"] || 0}
                  </td>
                  <td>{gradeSummary[grade]?.Female.Tall || 0}</td>
                  <td>
                    <strong>{gradeSummary[grade]?.Female.Total || 0}</strong>
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>

          <tfoot>
            <tr>
              <td>TOTALS</td>
              <td>Male</td>
              <td>{grandTotals?.Male.Normal || 0}</td>
              <td>{grandTotals?.Male.Wasted || 0}</td>
              <td>{grandTotals?.Male.SevWasted || 0}</td>
              <td>{grandTotals?.Male.Overweight || 0}</td>
              <td>{grandTotals?.Male.Obese || 0}</td>
              <td>{grandTotals?.Male.NormalHt || 0}</td>
              <td>{grandTotals?.Male.Stunted || 0}</td>
              <td>{grandTotals?.Male.SevStunted || 0}</td>
              <td>{grandTotals?.Male.Tall || 0}</td>
              <td>{grandTotals?.Male.Total || 0}</td>
            </tr>
            <tr>
              <td></td>
              <td>Female</td>
              <td>{grandTotals?.Female.Normal || 0}</td>
              <td>{grandTotals?.Female.Wasted || 0}</td>
              <td>{grandTotals?.Female.SevWasted || 0}</td>
              <td>{grandTotals?.Female.Overweight || 0}</td>
              <td>{grandTotals?.Female.Obese || 0}</td>
              <td>{grandTotals?.Female.NormalHt || 0}</td>
              <td>{grandTotals?.Female.Stunted || 0}</td>
              <td>{grandTotals?.Female.SevStunted || 0}</td>
              <td>{grandTotals?.Female.Tall || 0}</td>
              <td>{grandTotals?.Female.Total || 0}</td>
            </tr>
            <tr className="overall-grand-total">
              <td></td>
              <td style={{ fontWeight: "900" }}>Combined</td>
              <td>
                <strong>{grandTotals?.Combined.Normal || 0}</strong>
              </td>
              <td>
                <strong>{grandTotals?.Combined.Wasted || 0}</strong>
              </td>
              <td>
                <strong>{grandTotals?.Combined.SevWasted || 0}</strong>
              </td>
              <td>
                <strong>{grandTotals?.Combined.Overweight || 0}</strong>
              </td>
              <td>
                <strong>{grandTotals?.Combined.Obese || 0}</strong>
              </td>
              <td>
                <strong>{grandTotals?.Combined.NormalHt || 0}</strong>
              </td>
              <td>
                <strong>{grandTotals?.Combined.Stunted || 0}</strong>
              </td>
              <td>
                <strong>{grandTotals?.Combined.SevStunted || 0}</strong>
              </td>
              <td>
                <strong>{grandTotals?.Combined.Tall || 0}</strong>
              </td>
              <td>
                <strong style={{ color: "#1E3A8A" }}>
                  {grandTotals?.Combined.Total || 0}
                </strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        {GRADE_LEVELS.map((grade) => (
          <div
            key={grade}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              background: gradeBg[grade],
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {grade} — {gradeTotals[grade] || 0}
          </div>
        ))}
      </div>
    </div>
  );
}
