export const createId = (prefix: string): string => {
  const part = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${part}`;
};
