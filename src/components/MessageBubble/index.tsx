import { useEffect, useState } from "react";
import { MessageSquare, FileText, Search, Copy, CheckCheck, Share2, Volume2 } from "lucide-react";
import MsgContent from "../MsgContent";
import { formatTime } from "../../utils/helpers";
import type { Message, Citation } from "../../types";
import "./style.scss";

interface Props {
  message: Message;
  onCitationClick: (citation: Citation) => void;
}

function cleanResponseText(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[(\d+)\]/g, "source $1")
    .replace(/\s+/g, " ")
    .trim();
}

export default function MessageBubble({ message, onCitationClick }: Props) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    return () => window.speechSynthesis?.cancel();
  }, []);

  const handleCit = (id: number) => {
    const c = message.citations?.find((c) => c.id === id);
    if (c) onCitationClick(c);
  };

  const markCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const copyResponse = async () => {
    const text = cleanResponseText(message.content);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      markCopied();
    } catch { /* ignore */ }
  };

  const shareResponse = async () => {
    const text = cleanResponseText(message.content);
    if (!text) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "ChatMyDocs.ai response", text });
      } else {
        await navigator.clipboard.writeText(text);
        markCopied();
      }
    } catch { /* user cancelled or unavailable */ }
  };

  const speakResponse = () => {
    const text = cleanResponseText(message.content);
    if (!text || !("speechSynthesis" in window)) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className={`message-bubble${isUser ? " message-bubble--user" : ""}`}>
      {/* Avatar */}
      <div
        className={`message-bubble__avatar${
          isUser ? " message-bubble__avatar--user" : " message-bubble__avatar--ai"
        }`}
      >
        {isUser ? <span>U</span> : <MessageSquare size={15} />}
      </div>

      {/* Content column */}
      <div
        className={`message-bubble__content${
          isUser ? " message-bubble__content--user" : " message-bubble__content--ai"
        }`}
      >
        <div className="message-bubble__bubble-row">
          {/* Bubble */}
          <div
            className={`message-bubble__bubble${
              isUser ? " message-bubble__bubble--user" : " message-bubble__bubble--ai"
            }`}
          >
            {isUser ? (
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.6 }}>{message.content}</p>
            ) : (
              <>
                {message.content === "" && message.streaming ? (
                  <div className="message-bubble__document-search">
                    <div className="message-bubble__document-icon">
                      <FileText size={22} />
                      <Search size={14} className="message-bubble__document-search-icon" />
                      <span className="message-bubble__scan-line" />
                    </div>
                    <div className="message-bubble__document-search-copy">
                      <span className="message-bubble__document-search-title">Searching your documents</span>
                      <span className="message-bubble__document-search-subtitle">
                        Checking indexed pages for relevant context
                      </span>
                      <div className="message-bubble__document-search-steps">
                        {["Reading documents", "Finding matches", "Preparing answer"].map((step, i) => (
                          <span key={step} style={{ animationDelay: `${i * 180}ms` }}>
                            {step}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <MsgContent
                      content={message.content}
                      onCit={message.citations ? handleCit : undefined}
                    />
                    {message.streaming && (
                      <span className="message-bubble__cursor" />
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {!isUser && !message.streaming && message.content.trim() && (
            <div className="message-bubble__actions">
              <button onClick={copyResponse} title="Copy response" aria-label="Copy response">
                {copied ? <CheckCheck size={14} /> : <Copy size={14} />}
              </button>
              <button onClick={shareResponse} title="Share response" aria-label="Share response">
                <Share2 size={14} />
              </button>
              <button
                onClick={speakResponse}
                title={speaking ? "Stop reading" : "Read response aloud"}
                aria-label={speaking ? "Stop reading" : "Read response aloud"}
                className={speaking ? "message-bubble__action--active" : undefined}
              >
                <Volume2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Source chips */}
        {!isUser && message.citations && !message.streaming && (
          <div className="message-bubble__sources">
            {message.citations.map((c) => (
              <button
                key={c.id}
                className="source-chip"
                onClick={() => onCitationClick(c)}
              >
                <FileText size={11} className="source-chip__icon" />
                {c.docName} · p.{c.page}
              </button>
            ))}
          </div>
        )}

        <span className="message-bubble__timestamp">{formatTime(message.timestamp)}</span>
      </div>
    </div>
  );
}
