import type { PluginState } from "../../shared/contracts";

interface PluginStoreProps {
  plugins: PluginState[];
  onReload: () => void;
  onToggle: (pluginId: string, enabled: boolean) => void;
}

export const PluginStore = ({ plugins, onReload, onToggle }: PluginStoreProps): JSX.Element => {
  return (
    <section className="panel plugin-store">
      <header className="panel-title">
        Plugin Store
        <button className="mini-btn" onClick={onReload}>
          Reload
        </button>
      </header>
      <div className="plugin-list">
        {plugins.length === 0 && <p className="empty">No plugins detected.</p>}
        {plugins.map((plugin) => (
          <article key={plugin.manifest.id} className="plugin-item">
            <h4>{plugin.manifest.name}</h4>
            <p>{plugin.manifest.description}</p>
            <small>
              {plugin.manifest.entryCommand} | {plugin.manifest.permissionLevel} | entry{" "}
              {plugin.manifest.entry ?? "none"}
            </small>
            <div className="plugin-actions">
              <strong>{plugin.enabled ? "Enabled" : "Disabled"}</strong>
              <button
                type="button"
                className="mini-btn"
                onClick={() => onToggle(plugin.manifest.id, !plugin.enabled)}
              >
                {plugin.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};
