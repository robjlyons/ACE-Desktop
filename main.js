const path = require("path");
const { app, BrowserWindow, dialog, Menu, shell } = require("electron");
const processManager = require("./process-manager");

let mainWindow = null;
let splashWindow = null;
let isQuitting = false;

const APP_ICON_PATH = path.join(__dirname, "assets", "icon.icns");

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 640,
    height: 420,
    frame: false,
    resizable: false,
    transparent: true,
    alwaysOnTop: true,
    show: true,
    title: "ACE Desktop",
    icon: APP_ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.loadFile(path.join(__dirname, "assets", "splash.html"));
}

function setSplashStatus(statusText) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const safe = JSON.stringify(String(statusText));
  splashWindow.webContents.executeJavaScript(`window.updateSplashStatus(${safe});`).catch(() => {});
}

function closeSplashWindowSmoothly() {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents.executeJavaScript("window.fadeOutSplash();").catch(() => {});
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
  }, 300);
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: "ACE Desktop",
    show: false,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(url);
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    closeSplashWindowSmoothly();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startAndOpenWindow() {
  try {
    const result = await processManager.startAll({
      onStatus: (message) => setSplashStatus(message),
    });
    setSplashStatus("Opening workspace...");
    createWindow(result.frontendUrl);
  } catch (error) {
    const message = String(error?.message || error);
    dialog.showErrorBox(
      "ACE Desktop startup failed",
      `${message}\n\nCheck logs in:\n${processManager.LOG_DIR}`
    );
    app.quit();
  }
}

function createAppMenu() {
  const template = [
    {
      label: "ACE Desktop",
      submenu: [
        {
          label: "Restart Services",
          click: async () => {
            await processManager.stopAll();
            await startAndOpenWindow();
          },
        },
        {
          label: "Open Logs Folder",
          click: () => shell.openPath(processManager.LOG_DIR),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [{ role: "copy" }, { role: "paste" }, { role: "selectAll" }],
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { role: "togglefullscreen" }],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  createAppMenu();
  createSplashWindow();
  setSplashStatus("Initializing ACE Desktop...");
  await startAndOpenWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
      startAndOpenWindow();
    }
  });
});

app.on("before-quit", async (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  try {
    await processManager.stopAll();
  } finally {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
      splashWindow = null;
    }
    app.quit();
  }
});
