import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // you can expose safe APIs here
});
