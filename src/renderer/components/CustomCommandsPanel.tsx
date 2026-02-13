import { useState } from "react";
import type { CreateCustomCommandInput, CustomCommand, UpdateCustomCommandInput } from "../../shared/contracts";

interface CustomCommandsPanelProps {
  commands: CustomCommand[];
  onCreate: (input: CreateCustomCommandInput) => Promise<void>;
  onUpdate: (id: string, updates: UpdateCustomCommandInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTestRun: (name: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

/**
 * UI manager for listing and editing user-defined custom commands.
 */
export const CustomCommandsPanel = ({
  commands,
  onCreate,
  onUpdate,
  onDelete,
  onTestRun,
  onRefresh
}: CustomCommandsPanelProps): JSX.Element => {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [action, setAction] = useState("");
  const [passThroughArgs, setPassThroughArgs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const withBusy = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Custom command operation failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (): Promise<void> => {
    const payload: CreateCustomCommandInput = {
      name,
      trigger,
      action,
      passThroughArgs
    };

    await withBusy(async () => {
      await onCreate(payload);
      setName("");
      setTrigger("");
      setAction("");
      setPassThroughArgs(false);
    });
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

    await withBusy(async () => {
      await onUpdate(command.id, {
        name: nextName,
        trigger: nextTrigger,
        action: nextAction
      });
    });
  };

  return (
    <section className="panel custom-command-panel">
      <header className="panel-title">
        Custom Commands
        <button
          type="button"
          className="mini-btn"
          onClick={() => {
            void withBusy(onRefresh);
          }}
          disabled={busy}
        >
          Refresh
        </button>
      </header>

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
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  void withBusy(async () => {
                    await onTestRun(command.name);
                  });
                }}
              >
                Test Run
              </button>
              <button
                type="button"
                className="mini-btn"
                onClick={() => {
                  void withBusy(async () => {
                    await onUpdate(command.id, { enabled: !command.enabled });
                  });
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
                  void withBusy(async () => {
                    await onDelete(command.id);
                  });
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
