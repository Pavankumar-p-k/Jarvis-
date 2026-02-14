import { useEffect, useState } from "react";
import type { BackendRuntimeOptions, BackendRuntimeOptionsUpdate } from "../../shared/contracts";

interface BackendOptionsPanelProps {
  options: BackendRuntimeOptions | null;
  onSave: (updates: BackendRuntimeOptionsUpdate) => Promise<void>;
  onReset: () => Promise<void>;
}

/**
 * Runtime backend options editor for offline mode, voice, and local LLM settings.
 */
export const BackendOptionsPanel = ({ options, onSave, onReset }: BackendOptionsPanelProps): JSX.Element => {
  const [strictOffline, setStrictOffline] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [wakeWord, setWakeWord] = useState("jarvis");
  const [llmEnabled, setLlmEnabled] = useState(true);
  const [llmEndpoint, setLlmEndpoint] = useState("http://127.0.0.1:11434/api/generate");
  const [llmModel, setLlmModel] = useState("llama3.1:8b");
  const [llmTimeoutMs, setLlmTimeoutMs] = useState("4500");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!options) {
      return;
    }

    setStrictOffline(options.strictOffline);
    setVoiceEnabled(options.voice.enabled);
    setWakeWord(options.voice.wakeWord);
    setLlmEnabled(options.llm.enabled);
    setLlmEndpoint(options.llm.endpoint);
    setLlmModel(options.llm.model);
    setLlmTimeoutMs(String(options.llm.timeoutMs));
  }, [options]);

  const withBusy = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend options update failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    const timeoutValue = Number(llmTimeoutMs);
    if (!Number.isFinite(timeoutValue) || timeoutValue < 500) {
      setError("LLM timeout must be at least 500 ms.");
      return;
    }

    await withBusy(async () => {
      await onSave({
        strictOffline,
        voice: {
          enabled: voiceEnabled,
          wakeWord: wakeWord.trim()
        },
        llm: {
          enabled: llmEnabled,
          endpoint: llmEndpoint.trim(),
          model: llmModel.trim(),
          timeoutMs: Math.round(timeoutValue)
        }
      });
    });
  };

  return (
    <section className="panel backend-options-panel">
      <header className="panel-title">Backend Options</header>

      <div className="backend-grid">
        <label>
          <input
            type="checkbox"
            checked={strictOffline}
            onChange={(event) => setStrictOffline(event.target.checked)}
          />
          Strict offline mode
        </label>
        <label>
          <input
            type="checkbox"
            checked={voiceEnabled}
            onChange={(event) => setVoiceEnabled(event.target.checked)}
          />
          Voice enabled by default
        </label>
        <label>
          Wake word
          <input value={wakeWord} onChange={(event) => setWakeWord(event.target.value)} placeholder="jarvis" />
        </label>
        <label>
          <input
            type="checkbox"
            checked={llmEnabled}
            onChange={(event) => setLlmEnabled(event.target.checked)}
          />
          Local LLM enabled
        </label>
        <label>
          LLM endpoint
          <input
            value={llmEndpoint}
            onChange={(event) => setLlmEndpoint(event.target.value)}
            placeholder="http://127.0.0.1:11434/api/generate"
          />
        </label>
        <label>
          LLM model
          <input value={llmModel} onChange={(event) => setLlmModel(event.target.value)} placeholder="llama3.1:8b" />
        </label>
        <label>
          LLM timeout (ms)
          <input value={llmTimeoutMs} onChange={(event) => setLlmTimeoutMs(event.target.value)} placeholder="4500" />
        </label>
      </div>

      {error && <p className="backend-error">{error}</p>}

      <div className="backend-actions">
        <button className="mini-btn" type="button" disabled={busy} onClick={() => void handleSave()}>
          Save Backend Options
        </button>
        <button
          className="mini-btn"
          type="button"
          disabled={busy}
          onClick={() => {
            void withBusy(onReset);
          }}
        >
          Reset Defaults
        </button>
      </div>
    </section>
  );
};
