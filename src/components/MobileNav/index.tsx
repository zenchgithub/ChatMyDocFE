import { MessageSquare, Clock, FileText, Settings } from "lucide-react";
import type { View } from "../../types";
import "./style.scss";

interface Props {
  view: View;
  onViewChange: (v: View) => void;
}

const TABS = [
  { id: "chat" as View, label: "Chat", icon: MessageSquare },
  { id: "history" as View, label: "History", icon: Clock },
  { id: "documents" as View, label: "Documents", icon: FileText },
  { id: "settings" as View, label: "Settings", icon: Settings },
];

export default function MobileNav({ view, onViewChange }: Props) {
  return (
    <nav className="mobile-nav">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onViewChange(id)}
          className={`mobile-nav__tab${view === id ? " mobile-nav__tab--active" : ""}`}
        >
          <Icon size={20} />
          <span className="mobile-nav__label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
