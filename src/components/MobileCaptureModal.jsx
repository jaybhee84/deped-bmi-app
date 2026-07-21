import React, { useEffect, useState } from "react";
import Modal from "./Modal";

export default function MobileCaptureModal({
  student,
  onClose,
  onPhotoSynced,
  supabaseClient,
}) {
  const [isScanning, setIsScanning] = useState(true);
  const [syncStatus, setSyncStatus] = useState(
    "Waiting for mobile camera connection...",
  );

  // AUTOMATIC DETECTION:
  // window.location.hostname automatically grabs whatever IP your computer is using (e.g., 192.168.1.50)
  // window.location.port automatically grabs the current port (e.g., 5173)
  const currentHost = window.location.hostname;
  const currentPort = window.location.port || "5173";

  // Creates the perfect mobile landing route matching your exact current network location
  const captureUrl = `http://${currentHost}:${currentPort}/capture/${student.id}`;

  // Encodes the dynamic URL safely into the QR Code API
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(captureUrl)}`;

  useEffect(() => {
    if (!supabaseClient) return;

    // Listen to real-time changes on this specific student's row in Supabase
    const channel = supabaseClient
      .channel(`student-photo-sync-${student.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "students",
          filter: `id=eq.${student.id}`,
        },
        (payload) => {
          if (payload.new && payload.new.photo) {
            setSyncStatus("Photo received! Saving locally to SQLite...");
            setIsScanning(false);

            onPhotoSynced(payload.new.photo);

            setTimeout(() => {
              onClose();
            }, 1500);
          }
        },
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [student.id, supabaseClient, onPhotoSynced, onClose]);

  return (
    <Modal title={`Sync Photo: ${student.name}`} onClose={onClose}>
      <div className="mobile-sync-container">
        {isScanning ? (
          <div className="sync-qr-wrapper">
            <p className="sync-instructions">
              Scan this QR code with your phone camera to quickly snap and sync
              a profile picture.
            </p>

            <div className="qr-code-box">
              <img
                src={qrImageUrl}
                alt="Scan to capture"
                style={{ width: "200px", height: "200px", display: "block" }}
              />
            </div>

            <div className="sync-status-indicator pulse">
              <span className="status-dot green"></span>
              {syncStatus}
            </div>

            <div
              style={{ marginTop: "12px", fontSize: "11px", color: "#94a3b8" }}
            >
              Host: {captureUrl}
            </div>
          </div>
        ) : (
          <div className="sync-success-wrapper">
            <div className="success-checkmark">✓</div>
            <h3>Sync Complete!</h3>
            <p className="sync-status-indicator">{syncStatus}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
