export default function SchoolFilter({
  selectedSchool,
  setSelectedSchool,
  selectedSY,
  setSelectedSY,
  selectedPeriod,
  setSelectedPeriod,
}) {
  return (
    <div className="filter-row">
      {/* School */}
      <select
        value={selectedSchool}
        onChange={(e) => setSelectedSchool(e.target.value)}
      >
        <option>ALL SCHOOLS</option>
      </select>

      {/* SY */}
      <select
        value={selectedSY}
        onChange={(e) => setSelectedSY(e.target.value)}
      >
        ...
      </select>

      {/* Period */}
      <select
        value={selectedPeriod}
        onChange={(e) => setSelectedPeriod(e.target.value)}
      >
        ...
      </select>
    </div>
  );
}
