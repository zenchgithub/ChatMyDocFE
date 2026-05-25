import { Cpu, Layers, Shield, ChevronDown, AlertTriangle } from "lucide-react";
import Toggle from "../Toggle";
import type { SettingsTab, PipelineStage } from "../../types";
import "./style.scss";

interface Props {
  settingsTab: SettingsTab;
  onTabChange: (t: SettingsTab) => void;
  planningModel: string;
  onPlanningModelChange: (v: string) => void;
  embeddingModel: string;
  onEmbeddingModelChange: (v: string) => void;
  answerModel: string;
  onAnswerModelChange: (v: string) => void;
  answerLength: string;
  onAnswerLengthChange: (v: string) => void;
  stages: PipelineStage[];
  onStagesChange: (s: PipelineStage[]) => void;
  modEnabled: boolean;
  onModEnabledChange: (v: boolean) => void;
  flagAction: "block" | "warn";
  onFlagActionChange: (v: "block" | "warn") => void;
}

const SETTINGS_NAV = [
  { id: "models" as SettingsTab, label: "Models & Behavior", icon: Cpu },
  { id: "pipeline" as SettingsTab, label: "Pipeline Stages", icon: Layers },
  { id: "safety" as SettingsTab, label: "Safety & Moderation", icon: Shield },
];

const MODEL_OPTIONS = {
  planning: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
  embedding: ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"],
  answer: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
};

export default function SettingsView({
  settingsTab, onTabChange,
  planningModel, onPlanningModelChange,
  embeddingModel, onEmbeddingModelChange,
  answerModel, onAnswerModelChange,
  answerLength, onAnswerLengthChange,
  stages, onStagesChange,
  modEnabled, onModEnabledChange,
  flagAction, onFlagActionChange,
}: Props) {
  const updateStage = (id: string, patch: Partial<PipelineStage>) => {
    onStagesChange(stages.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className="settings-view">
      {/* Desktop nav */}
      <nav className="settings-view__nav">
        <p className="settings-view__nav-label">Configuration</p>
        {SETTINGS_NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`settings-view__nav-item${settingsTab === id ? " settings-view__nav-item--active" : ""}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="settings-view__content">
        <div className="settings-view__inner">
          {/* Mobile tabs */}
          <div className="settings-view__mobile-tabs">
            {SETTINGS_NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`settings-view__mobile-tab${settingsTab === id ? " settings-view__mobile-tab--active" : ""}`}
              >
                <Icon size={14} />
                {label.split(" ")[0]}
              </button>
            ))}
          </div>

          {/* ── Models & Behavior */}
          {settingsTab === "models" && (
            <div>
              <p className="settings-section__title">Models & Behavior</p>
              <p className="settings-section__desc">
                Configure the AI models used at each stage of the retrieval pipeline.
              </p>
              <div className="settings-section__cards">
                {[
                  { label: "Planning Model", desc: "Decomposes queries into structured retrieval sub-tasks", value: planningModel, onChange: onPlanningModelChange, options: MODEL_OPTIONS.planning },
                  { label: "Embedding Model", desc: "Generates vector embeddings for document indexing", value: embeddingModel, onChange: onEmbeddingModelChange, options: MODEL_OPTIONS.embedding },
                  { label: "Answer Model", desc: "Synthesizes the final cited answer from retrieved context", value: answerModel, onChange: onAnswerModelChange, options: MODEL_OPTIONS.answer },
                ].map(({ label, desc, value, onChange, options }) => (
                  <div key={label} className="settings-card">
                    <div className="settings-card__row">
                      <div>
                        <p className="settings-card__label">{label}</p>
                        <p className="settings-card__desc">{desc}</p>
                      </div>
                      <div className="settings-card__select-wrap">
                        <select
                          className="settings-card__select"
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                        >
                          {options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <ChevronDown size={12} className="settings-card__chevron" />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="settings-card">
                  <p className="settings-card__label">Answer Length Preference</p>
                  <p className="settings-card__desc">Controls default verbosity of synthesized answers.</p>
                  <div className="settings-card__length-options">
                    {["short", "normal", "detailed"].map((l) => (
                      <button
                        key={l}
                        onClick={() => onAnswerLengthChange(l)}
                        className={`settings-card__length-btn${answerLength === l ? " settings-card__length-btn--active" : ""}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Pipeline Stages */}
          {settingsTab === "pipeline" && (
            <div>
              <p className="settings-section__title">Pipeline Stages</p>
              <p className="settings-section__desc">
                Enable, disable, or tune each stage of the LangGraph retrieval pipeline.
              </p>
              <div className="settings-section__cards">
                {stages.map((stage, i) => (
                  <div key={stage.id} className="pipeline-card">
                    <div className="pipeline-card__inner">
                      <div className="pipeline-card__num">
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="pipeline-card__body">
                        <div className="pipeline-card__header">
                          <p className="pipeline-card__name">{stage.name}</p>
                          <Toggle
                            on={stage.enabled}
                            onChange={(v) => updateStage(stage.id, { enabled: v })}
                            label={`Toggle ${stage.name}`}
                          />
                        </div>
                        <p className="pipeline-card__desc">{stage.description}</p>
                        {stage.topK !== undefined && stage.enabled && (
                          <div className="pipeline-card__numeric">
                            <label className="pipeline-card__numeric-label">Top K results</label>
                            <input
                              type="number"
                              className="pipeline-card__numeric-input"
                              value={stage.topK}
                              min={1}
                              max={20}
                              onChange={(e) => updateStage(stage.id, { topK: +e.target.value })}
                            />
                          </div>
                        )}
                        {stage.topN !== undefined && stage.enabled && (
                          <div className="pipeline-card__numeric">
                            <label className="pipeline-card__numeric-label">Top N after rerank</label>
                            <input
                              type="number"
                              className="pipeline-card__numeric-input"
                              value={stage.topN}
                              min={1}
                              max={10}
                              onChange={(e) => updateStage(stage.id, { topN: +e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Safety & Moderation */}
          {settingsTab === "safety" && (
            <div>
              <p className="settings-section__title">Safety & Moderation</p>
              <p className="settings-section__desc">
                Control how sensitive or flagged queries are handled before processing.
              </p>
              <div className="settings-section__cards">
                <div className="settings-card">
                  <div className="settings-card__row">
                    <div>
                      <p className="settings-card__label">OpenAI Content Moderation</p>
                      <p className="settings-card__desc">
                        Run incoming questions through the moderation API before processing.
                      </p>
                    </div>
                    <Toggle on={modEnabled} onChange={onModEnabledChange} label="Toggle moderation" />
                  </div>
                </div>

                {modEnabled && (
                  <div className="settings-card">
                    <p className="settings-card__label" style={{ marginBottom: "0.75rem" }}>
                      When a question is flagged…
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {[
                        { value: "block", label: "Block the request", desc: "Reject the query and return an error message to the user." },
                        { value: "warn", label: "Warn and continue", desc: "Proceed but surface a moderation warning in the UI." },
                      ].map(({ value, label, desc }) => (
                        <button
                          key={value}
                          className={`safety-radio${flagAction === value ? " safety-radio--active" : ""}`}
                          onClick={() => onFlagActionChange(value as "block" | "warn")}
                        >
                          <div className={`safety-radio__dot${flagAction === value ? " safety-radio__dot--active" : ""}`}>
                            {flagAction === value && <div className="safety-radio__inner-dot" />}
                          </div>
                          <div>
                            <p className="safety-radio__label">{label}</p>
                            <p className="safety-radio__desc">{desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="safety-warning">
                  <AlertTriangle size={15} className="safety-warning__icon" />
                  <p className="safety-warning__text">
                    Content moderation adds 100–200ms latency per query. For high-throughput internal
                    deployments, consider using <strong style={{ color: "var(--foreground)" }}>warn</strong> mode
                    or disabling moderation entirely.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
