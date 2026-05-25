import { useState } from "react";
import { FileText, Plus, LayoutGrid, List } from "lucide-react";
import type { DocFile } from "../../types";
import "./style.scss";

interface Props {
  docs: DocFile[];
}

const COLLECTIONS = ["all", "personal_docs", "nas_docs"];

export default function DocumentsView({ docs }: Props) {
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const filtered = filter === "all" ? docs : docs.filter((d) => d.collection === filter);

  return (
    <div className="documents-view">
      <div className="documents-view__inner">
        <div className="documents-view__header">
          <div className="documents-view__heading-group">
            <h2 className="documents-view__heading">
              <FileText size={20} style={{ color: "var(--accent)" }} />
              Document Library
            </h2>
            <span className="documents-view__count-badge">{docs.length} docs</span>
          </div>
          <div className="documents-view__actions">
            <button
              className="documents-view__view-toggle"
              onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
              aria-label="Toggle view"
            >
              {viewMode === "list" ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>
            <button className="documents-view__add-btn">
              <Plus size={14} />
              Add Documents
            </button>
          </div>
        </div>

        <div className="documents-view__filters">
          {COLLECTIONS.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`documents-view__filter-btn${filter === c ? " documents-view__filter-btn--active" : ""}`}
            >
              {c === "all" ? "All Collections" : c.replace("_", " ")}
            </button>
          ))}
        </div>

        {viewMode === "list" ? (
          <div className="documents-view__list">
            {filtered.map((doc) => (
              <div key={doc.id} className="doc-list-item">
                <div className="doc-list-item__icon">
                  <FileText size={16} />
                </div>
                <div className="doc-list-item__info">
                  <p className="doc-list-item__name">{doc.name}</p>
                  <div className="doc-list-item__meta">
                    <span>{doc.collection}</span>
                    <span className="doc-list-item__sep">·</span>
                    <span>{doc.pages} pages</span>
                    <span className="doc-list-item__sep">·</span>
                    <span>{doc.size}</span>
                  </div>
                </div>
                <div className="doc-list-item__indexed">
                  <div className="doc-list-item__indexed-label">Indexed</div>
                  <div className="doc-list-item__indexed-date">{doc.lastIndexed}</div>
                </div>
                <span className="doc-list-item__status-dot" title="Indexed" />
              </div>
            ))}
          </div>
        ) : (
          <div className="documents-view__grid">
            {filtered.map((doc) => (
              <div key={doc.id} className="doc-grid-card">
                <div className="doc-grid-card__icon">
                  <FileText size={18} />
                </div>
                <p className="doc-grid-card__name">{doc.name}</p>
                <p className="doc-grid-card__meta">{doc.pages} pages · {doc.size}</p>
                <div className="doc-grid-card__status">
                  <span className="doc-grid-card__status-dot" />
                  <span className="doc-grid-card__status-label">Indexed</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
