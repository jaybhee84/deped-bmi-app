import "./ReleaseNotesModal.css";

export default function ReleaseNotesModal({
  open,
  version,
  sections,
  onClose,
}) {
  if (!open) return null;

  const safeSections = Array.isArray(sections) ? sections : [];

  return (
    <div className="release-overlay">
      <div className="release-modal">
        <h2>{version}</h2>

        {safeSections.map((section, sIndex) => (
          <div key={sIndex} className="release-section">
            <h3>{section.heading}</h3>
            <ul>
              {(section.items || []).map((item, iIndex) => (
                <li key={iIndex}>{item}</li>
              ))}
            </ul>
          </div>
        ))}

        <button className="btn btn-primary" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}
