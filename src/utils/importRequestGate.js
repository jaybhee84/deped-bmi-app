export function createImportRequestGate() {
  let generation = 0;
  return {
    invalidate() { generation++; },
    start() {
      const request = ++generation;
      return () => request === generation;
    },
  };
}
