import { useRef, useEffect, useState } from "react";
import { Send, Zap } from "lucide-react";
import MessageBubble from "../MessageBubble";
import LogoMark from "../LogoMark";
import type { Message, Citation, AnswerStyle } from "../../types";
import "./style.scss";

interface Props {
  messages: Message[];
  isStreaming: boolean;
  onSend: (text: string, stream: boolean) => void;
  onCitationClick: (citation: Citation) => void;
}

export default function ChatView({ messages, isStreaming, onSend, onCitationClick }: Props) {
  const [inputText, setInputText] = useState("");
  const [answerStyle, setAnswerStyle] = useState<AnswerStyle>("detailed");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (stream = false) => {
    if (!inputText.trim() || isStreaming) return;
    onSend(inputText, stream);
    setInputText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(false);
    }
  };

  return (
    <div className="chat-view">
      {/* Messages */}
      <div className="chat-view__messages">
        <div className="chat-view__messages-inner">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <LogoMark size={52} variant="lg" />
              <h2 className="chat-empty__title">Your Document Brain</h2>
              <p className="chat-empty__tagline">
                Chat with your documents. Get smart, summarized answers with citations.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onCitationClick={onCitationClick}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="chat-input">
        <div className="chat-input__inner">
          <div className="chat-input__style-row">
            <span className="chat-input__style-label">Style:</span>
            {(["concise", "detailed", "bullet"] as AnswerStyle[]).map((s) => (
              <button
                key={s}
                onClick={() => setAnswerStyle(s)}
                className={`chat-input__style-btn${answerStyle === s ? " chat-input__style-btn--active" : ""}`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="chat-input__row">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your documents…"
              rows={1}
              className="chat-input__textarea"
            />
            <div className="chat-input__actions">
              <button
                className="chat-input__stream-btn"
                onClick={() => handleSend(true)}
                disabled={!inputText.trim() || isStreaming}
                title="Get JSON reply (/query)"
              >
                <Zap size={14} />
                <span className="chat-input__btn-label">Query</span>
              </button>
              <button
                className="chat-input__send-btn"
                onClick={() => handleSend(false)}
                disabled={!inputText.trim() || isStreaming}
                title="Send (/query)"
              >
                <Send size={14} />
                <span className="chat-input__btn-label">Send</span>
              </button>
            </div>
          </div>
          <p className="chat-input__hint">
            Enter to send · Shift+Enter for new line · LangGraph + FastAPI pipeline
          </p>
        </div>
      </div>
    </div>
  );
}
