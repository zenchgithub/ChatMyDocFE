import { X, BookOpen, FileText, Download } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Citation } from "../../types";
import "./style.scss";

interface Props {
  citation: Citation | null;
  onClose: () => void;
}

export default function SourceDrawer({ citation, onClose }: Props) {
  return (
    <AnimatePresence>
      {citation && (
        <>
          <div className="source-drawer-backdrop" onClick={onClose} />
          <motion.aside
            key="source-drawer"
            className="source-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
          >
            <div className="source-drawer__header">
              <div className="source-drawer__header-left">
                <BookOpen size={15} />
                <span>Source</span>
              </div>
              <button className="source-drawer__close-btn" onClick={onClose} aria-label="Close">
                <X size={15} />
              </button>
            </div>

            <div className="source-drawer__body">
              <div className="source-drawer__doc-card">
                <div className="source-drawer__doc-icon">
                  <FileText size={16} />
                </div>
                <div>
                  <p className="source-drawer__doc-name">{citation.docName}</p>
                  <p className="source-drawer__doc-meta">
                    Page {citation.page} · {citation.collection}
                  </p>
                </div>
              </div>

              <div>
                <p className="source-drawer__section-label">Relevant text from document</p>
                <blockquote className="source-drawer__excerpt">
                  "{citation.snippet}"
                </blockquote>
              </div>

              <div className="source-drawer__divider">
                <hr />
                <span>p.{citation.page}</span>
                <hr />
              </div>

              <button className="source-drawer__open-btn">
                <Download size={14} />
                Open full document
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
