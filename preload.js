const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("aceDesktop", {
  platform: process.platform,
});
