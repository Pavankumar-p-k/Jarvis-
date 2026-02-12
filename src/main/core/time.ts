export const parseTimeRange = (value: string): { startMinutes: number; endMinutes: number } | null => {
  const match = value.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endMinutes = Number(match[3]) * 60 + Number(match[4]);
  if (startMinutes < 0 || endMinutes > 24 * 60) {
    return null;
  }
  return { startMinutes, endMinutes };
};

export const nowMinutes = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};
