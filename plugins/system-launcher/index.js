exports.handle = async ({ args }) => {
  const app = String(args || "").trim().toLowerCase();
  if (!app) {
    return {
      ok: false,
      message: "Usage: /launch <app-name>"
    };
  }

  return {
    ok: true,
    message: `System Launcher received "${app}". Run: open ${app}`,
    data: {
      app
    }
  };
};
