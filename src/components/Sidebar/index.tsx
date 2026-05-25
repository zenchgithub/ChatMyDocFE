import { MessageSquare, Clock, FileText, Settings, Plus } from "lucide-react";
import LogoMark from "../LogoMark";
import type { View, PipelineStage } from "../../types";
import "./style.scss";

interface Props {
  view: View;
  onViewChange: (v: View) => void;
  isOpen: boolean;
  onClose: () => void;
  stages: PipelineStage[];
  totalDocs: number;
  onNewChat: () => void;
}

const NAV_ITEMS = [
  { id: "chat" as View, label: "Chat", icon: MessageSquare },
  { id: "history" as View, label: "History", icon: Clock },
  { id: "documents" as View, label: "Documents", icon: FileText },
  { id: "settings" as View, label: "Settings", icon: Settings },
];

export default function Sidebar({
  view,
  onViewChange,
  isOpen,
  onClose,
  stages,
  totalDocs,
  onNewChat,
}: Props) {
  const activeCount = stages.filter((s) => s.enabled).length;

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar${isOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar__mobile-header">
          <LogoMark size={28} />
          <span className="sidebar__mobile-brand">
            ChatMyDocs<span className="sidebar__mobile-accent">.ai</span>
          </span>
        </div>

        <button
          className="sidebar__new-chat"
          onClick={() => { onNewChat(); onClose(); }}
        >
          <Plus size={14} />
          New Chat
        </button>

        <nav className="sidebar__nav">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { onViewChange(id); onClose(); }}
              className={`sidebar__nav-item${view === id ? " sidebar__nav-item--active" : ""}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__status-card">
            <div className="sidebar__status-header">
              <span className="sidebar__status-dot" />
              <span className="sidebar__status-label">Pipeline Active</span>
            </div>
            <p className="sidebar__status-detail">
              {activeCount} stages · {totalDocs} docs indexed
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
