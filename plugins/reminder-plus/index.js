exports.handle = async ({ args }) => {
  const cleaned = String(args || "").trim();
  if (!cleaned) {
    return {
      ok: false,
      message: 'Usage: /remindplus "task"'
    };
  }

  return {
    ok: true,
    message: `Reminder Plus captured: ${cleaned}. Suggested command: remind me ${cleaned} in 15m`
  };
};
