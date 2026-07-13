export function createOperationGate({
  formatBusyMessage = (label) => `${label} 正在进行，请等待完成。`
} = {}) {
  let currentLabel = "";
  return {
    get busy() {
      return Boolean(currentLabel);
    },
    get currentLabel() {
      return currentLabel;
    },
    async run(label, task) {
      if (currentLabel) {
        throw new Error(formatBusyMessage(currentLabel));
      }
      currentLabel = label;
      try {
        return await task();
      } finally {
        currentLabel = "";
      }
    }
  };
}
