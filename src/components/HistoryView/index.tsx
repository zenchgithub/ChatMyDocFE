import { Clock, MessageSquare, ChevronRight, Search } from "lucide-react";
import { formatTime } from "../../utils/helpers";
import type { HistoryItem } from "../../types";
import "./style.scss";

interface Props {
  history: HistoryItem[];
  onSelectItem: () => void;
}

export default function HistoryView({ history, onSelectItem }: Props) {
  return (
    <div className="history-view">
      <div className="history-view__inner">
        <h2 className="history-view__heading">
          <Clock size={20} style={{ color: "var(--accent)" }} />
          Conversation History
        </h2>

        <div className="history-view__search-wrap">
          <Search size={15} className="history-view__search-icon" />
          <input
            className="history-view__search"
            placeholder="Search past questions…"
          />
        </div>

        <div className="history-view__list">
          {history.map((item) => (
            <button
              key={item.id}
              className="history-view__item"
              onClick={onSelectItem}
            >
              <MessageSquare size={15} className="history-view__item-icon" />
              <div className="history-view__item-body">
                <p className="history-view__item-question">{item.question}</p>
                <div className="history-view__item-meta">
                  <span className="history-view__source-badge">{item.sourceCount} src</span>
                  <span className="history-view__time">{formatTime(item.timestamp)}</span>
                </div>
              </div>
              <ChevronRight size={14} className="history-view__chevron" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
