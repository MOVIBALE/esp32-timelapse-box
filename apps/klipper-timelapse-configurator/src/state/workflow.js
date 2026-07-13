export const initialWorkflow = {
  step: "connect",
  safetyMode: "disabled",
  notice: "none",
  board: {
    connected: false,
    portLabel: ""
  },
  lastLayer: null,
  totalLayer: null,
  currentFile: "",
  lastEventAt: "",
  dryRunEvents: 0,
  safeConfigured: false,
  mainPyRemoved: false
};

export function reduceWorkflow(state, event) {
  switch (event.type) {
    case "boardConnected":
      return {
        ...state,
        step: "configure",
        notice: "none",
        board: { connected: true, portLabel: event.portLabel },
        mainPyRemoved: false
      };
    case "safeUploaded":
      return {
        ...state,
        step: "safe-uploaded",
        safetyMode: "disabled",
        notice: "none",
        safeConfigured: true,
        mainPyRemoved: false
      };
    case "dryRunEnabled":
      return {
        ...state,
        step: "observe",
        safetyMode: "dry-run",
        notice: "none"
      };
    case "dryRunEventSeen":
      return {
        ...state,
        step: "observe",
        safetyMode: "dry-run",
        dryRunEvents: state.dryRunEvents + 1,
        lastLayer: event.layer,
        totalLayer: event.totalLayer,
        currentFile: event.filename || "",
        lastEventAt: event.observedAt || ""
      };
    case "armRequested":
      if (!event.confirmed) {
        return { ...state, notice: "armedConfirmationRequired" };
      }
      return {
        ...state,
        step: "armed",
        safetyMode: "armed",
        notice: "none"
      };
    case "recovering":
      return {
        ...state,
        step: "recover",
        safetyMode: "recovering",
        notice: "none"
      };
    case "recovered":
      return {
        ...state,
        step: "recovered",
        safetyMode: "recovered",
        notice: "recovered",
        mainPyRemoved: true
      };
    default:
      return state;
  }
}
