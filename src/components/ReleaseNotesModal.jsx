import "./ReleaseNotesModal.css";

export default function ReleaseNotesModal({ open, version, notes, onClose }) {
  if (!open) return null;

  return (
    <div className="release-overlay">
      <div className="release-modal">
        <h2>{version}</h2>

        <ul>
          {notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>

        <button className="btn btn-primary" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}
