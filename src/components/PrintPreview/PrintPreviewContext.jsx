import { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PrintPreviewModal from "./PrintPreviewModal";
import { documentFromElement, inlineDocumentImages, PRINT_PAPER } from "./printDocument";

const PrintPreviewContext = createContext(null);

export function PrintPreviewProvider({ children }) {
  const [setup, setSetup] = useState(null);
  const busy = useRef(false);

  // options: { html } for a ready document, or { element, css } to print an
  // on-screen sheet as displayed with its stylesheet; plus orientation
  // ("portrait" | "landscape"), margin (inches) and title.
  const requestPrint = useCallback(async (options = {}) => {
    if (busy.current) return;
    const orientation = options.orientation || "portrait";
    const margin = options.margin ?? 0.35;
    busy.current = true;
    try {
      const html = options.html != null
        ? await inlineDocumentImages(options.html)
        : (options.element
        ? await documentFromElement(options.element, { orientation, margin, title: options.title, css: options.css })
        : null);
      if (!html) throw new Error("Nothing to print.");

      if (!window.electronAPI?.printPrepare) {
        // Browser fallback: the system print dialog.
        busy.current = false;
        const popup = window.open("", "_blank", "width=900,height=1000");
        if (!popup) throw new Error("Allow popups to print this report.");
        popup.document.write(html);
        popup.document.close();
        await popup.document.fonts?.ready;
        await Promise.all([...popup.document.images].map((img) => img.decode().catch(() => {})));
        popup.focus();
        popup.print();
        return;
      }

      const result = await window.electronAPI.printPrepare({ html, paper: PRINT_PAPER, margin, orientation });
      if (!result?.success) throw new Error(result?.error || "Could not prepare the document.");
      setSetup({
        paper: PRINT_PAPER,
        orientation,
        margins: "match",
        customMargins: { top: margin, bottom: margin, left: margin, right: margin },
      });
    } catch (error) {
      busy.current = false;
      const message = error.message || "Could not prepare the print preview.";
      window.alert(message.includes("No handler registered for 'print:prepare'")
        ? "Please close the app completely and open it again to enable Print Preview. Reloading the page does not update the print service."
        : message);
    }
  }, []);

  const closePreview = useCallback(() => {
    setSetup(null);
    Promise.resolve(window.electronAPI?.printCleanupPreview?.()).finally(() => { busy.current = false; });
  }, []);

  return (
    <PrintPreviewContext.Provider value={{ requestPrint }}>
      {children}
      {setup && createPortal(<PrintPreviewModal setup={setup} onClose={closePreview} />, document.body)}
    </PrintPreviewContext.Provider>
  );
}

export function usePrintPreview() {
  return useContext(PrintPreviewContext);
}
