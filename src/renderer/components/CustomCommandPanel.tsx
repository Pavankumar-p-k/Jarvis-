import { useState } from "react";
import type { CreateCustomCommandInput, CustomCommand, UpdateCustomCommandInput } from "../../shared/contracts";

interface CustomCommandPanelProps {
  commands: CustomCommand[];
  onCreate: (input: CreateCustomCommandInput) => Promise<void>;
  onUpdate: (id: string, updates: UpdateCustomCommandInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRun: (trigger: string) => void;
}

export const CustomCommandPanel = ({
  commands,
  onCreate,
  onUpdate,
  onDelete,
  onRun
}: CustomCommandPanelProps): JSX.Element => {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [action, setAction] = useState("");
  const [passThroughArgs, setPassThroughArgs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (): Promise<void> => {
    const payload: CreateCustomCommandInput = {
      name,
      trigger,
      action,
      passThroughArgs
    };

    setBusy(true);
    setError(null);
    try {
      await onCreate(payload);
      setName("");
      setTrigger("");
      setAction("");
      setPassThroughArgs(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create custom command.");
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (command: CustomCommand): Promise<void> => {
    const nextName = window.prompt("Command name", command.name);
    if (nextName === null) {
      return;
    }

    const nextTrigger = window.prompt("Trigger text", command.trigger);
    if (nextTrigger === null) {
      return;
    }

    const nextAction = window.prompt("Action command", command.action);
    if (nextAction === null) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onUpdate(command.id, {
        name: nextName,
        trigger: nextTrigger,
        action: nextAction
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update custom command.");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleEnabled = async (command: CustomCommand): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onUpdate(command.id, { enabled: !command.enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to toggle custom command.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onDelete(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete custom command.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel custom-command-panel">
      <header className="panel-title">Custom Commands</header>

      <div className="custom-command-form">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name (e.g. Start focus sprint)"
        />
        <input
          value={trigger}
          onChange={(event) => setTrigger(event.target.value)}
          placeholder="Trigger (e.g. start sprint)"
        />
        <input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="Action (e.g. run routine focus sprint)"
        />
        <label className="custom-args-toggle">
          <input
            type="checkbox"
            checked={passThroughArgs}
            onChange={(event) => setPassThroughArgs(event.target.checked)}
          />
          Forward extra words to action
        </label>
        <button
          type="button"
          className="mini-btn"
          onClick={() => {
            void handleCreate();
          }}
          disabled={busy}
        >
          Add Command
        </button>
      </div>

      {error && <p className="custom-command-error">{error}</p>}

      <div className="custom-command-list">
        {commands.length === 0 && <p className="empty">No custom commands yet.</p>}
        {commands.map((command) => (
          <article key={command.id} className="custom-command-item">
            <div>
              <h4>{command.name}</h4>
              <small>
                trigger: {command.trigger} | action: {command.action}
              </small>
              {command.passThroughArgs && <small>args forwarding enabled</small>}
            </div>
            <div className="custom-command-actions">
              <strong>{command.enabled ? "Enabled" : "Disabled"}</strong>
              <button type="button" className="mini-btn" onClick={() => onRun(command.trigger)}>
                Run
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  void handleToggleEnabled(command);
                }}
              >
                {command.enabled ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  void handleEdit(command);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  void handleDelete(command.id);
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
