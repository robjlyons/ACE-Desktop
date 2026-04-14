const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { setTimeout: sleep } = require("timers/promises");

const APP_DIR = __dirname;

function firstExistingDir(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

const WORKSPACE_ROOT = firstExistingDir([
  process.env.ACE_WORKSPACE_ROOT,
  path.resolve(APP_DIR, ".."),
  path.join(os.homedir(), "Documents", "ACE"),
  path.join(os.homedir(), "ACE"),
]);

const ACESTEP_DIR = firstExistingDir([
  process.env.ACESTEP_DIR,
  WORKSPACE_ROOT ? path.join(WORKSPACE_ROOT, "ACE-Step-1.5") : null,
  path.join(os.homedir(), "Documents", "ACE-Step-1.5"),
  path.join(os.homedir(), "Documents", "ACE", "ACE-Step-1.5"),
  path.join(os.homedir(), "ACE-Step-1.5"),
  path.join(os.homedir(), "ACE", "ACE-Step-1.5"),
]) || (WORKSPACE_ROOT ? path.join(WORKSPACE_ROOT, "ACE-Step-1.5") : path.join(os.homedir(), "ACE-Step-1.5"));

const UI_DIR = firstExistingDir([
  process.env.ACE_STEP_UI_DIR,
  WORKSPACE_ROOT ? path.join(WORKSPACE_ROOT, "ace-step-ui") : null,
  path.join(os.homedir(), "Documents", "ace-step-ui"),
  path.join(os.homedir(), "Documents", "ACE", "ace-step-ui"),
  path.join(os.homedir(), "ace-step-ui"),
  path.join(os.homedir(), "ACE", "ace-step-ui"),
]) || (WORKSPACE_ROOT ? path.join(WORKSPACE_ROOT, "ace-step-ui") : path.join(os.homedir(), "ace-step-ui"));

const UI_SERVER_DIR = path.join(UI_DIR, "server");

const DEFAULT_STATE_DIR = path.join(os.homedir(), "Library", "Application Support", "ACE Desktop");
const STATE_DIR = process.env.ACE_STATE_DIR || DEFAULT_STATE_DIR;
const LOG_DIR = process.env.ACE_LOG_DIR || path.join(STATE_DIR, "logs");
const RUN_DIR = process.env.ACE_RUN_DIR || path.join(STATE_DIR, "run");
const MAX_SERVICE_LOG_BYTES = 5 * 1024 * 1024;

const PORTS = {
  api: Number(process.env.ACE_API_PORT || 8001),
  backend: Number(process.env.ACE_BACKEND_PORT || 3001),
  frontend: Number(process.env.ACE_FRONTEND_PORT || 3000),
};

const URLS = {
  apiHealth: `http://127.0.0.1:${PORTS.api}/health`,
  frontend: `http://127.0.0.1:${PORTS.frontend}`,
};

let managedChildren = [];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function requireCommand(commandName) {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", `command -v ${commandName}`], { stdio: "ignore" });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Missing required command: ${commandName}`));
      }
    });
  });
}

function ensureDirsExist() {
  const required = [ACESTEP_DIR, UI_DIR, UI_SERVER_DIR];
  for (const dirPath of required) {
    if (!fs.existsSync(dirPath)) {
      throw new Error(
        `Missing required directory: ${dirPath}\n` +
        "Set ACESTEP_DIR and ACE_STEP_UI_DIR in your environment if your folders are in a custom location."
      );
    }
  }
}

function pidPath(name) {
  return path.join(RUN_DIR, `${name}.pid`);
}

function logPath(name) {
  return path.join(LOG_DIR, `${name}.log`);
}

function logBackupPath(name) {
  return path.join(LOG_DIR, `${name}.log.1`);
}

function rotateServiceLogIfNeeded(name) {
  const currentLogPath = logPath(name);
  if (!fs.existsSync(currentLogPath)) return;
  const { size } = fs.statSync(currentLogPath);
  if (size < MAX_SERVICE_LOG_BYTES) return;

  const backupPath = logBackupPath(name);
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  fs.renameSync(currentLogPath, backupPath);
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(name) {
  const filePath = pidPath(name);
  if (!fs.existsSync(filePath)) return null;
  const value = fs.readFileSync(filePath, "utf8").trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function writePid(name, pid) {
  fs.writeFileSync(pidPath(name), String(pid), "utf8");
}

function removePid(name) {
  const filePath = pidPath(name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function cleanupStalePid(name) {
  const pid = readPid(name);
  if (pid && !isProcessAlive(pid)) {
    removePid(name);
  }
}

function spawnLogged(name, command, args, options = {}) {
  rotateServiceLogIfNeeded(name);
  const out = fs.createWriteStream(logPath(name), { flags: "a" });
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.pipe(out);
  child.stderr.pipe(out);
  writePid(name, child.pid);

  managedChildren.push({ name, child });
  return child;
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(port, "127.0.0.1");
  });
}

async function waitForPort(name, port, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(port)) return;
    await sleep(1000);
  }
  throw new Error(`Timeout waiting for ${name} on port ${port}`);
}

async function waitForHttp(url, timeoutMs = 360000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until timeout
    }
    await sleep(1500);
  }
  throw new Error(`Timeout waiting for URL: ${url}`);
}

async function failIfPortBusy(port, label) {
  if (await isPortOpen(port)) {
    throw new Error(`Port ${port} already in use; cannot start ${label}.`);
  }
}

function runningFromPidFiles() {
  const apiPid = readPid("api");
  const backendPid = readPid("backend");
  const frontendPid = readPid("frontend");
  return Boolean(
    apiPid && backendPid && frontendPid &&
    isProcessAlive(apiPid) && isProcessAlive(backendPid) && isProcessAlive(frontendPid)
  );
}

async function preflight() {
  ensureDir(LOG_DIR);
  ensureDir(RUN_DIR);
  ensureDirsExist();

  cleanupStalePid("api");
  cleanupStalePid("backend");
  cleanupStalePid("frontend");

  await requireCommand("uv");
  await requireCommand("node");
  await requireCommand("npm");
}

async function startAll(options = {}) {
  const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};
  onStatus("Running startup checks...");
  await preflight();

  if (runningFromPidFiles()) {
    onStatus("Services already running.");
    return { alreadyRunning: true, frontendUrl: URLS.frontend };
  }

  onStatus("Checking service ports...");
  await failIfPortBusy(PORTS.api, "ACE API");
  await failIfPortBusy(PORTS.backend, "UI backend");
  await failIfPortBusy(PORTS.frontend, "UI frontend");

  onStatus("Starting ACE API...");
  spawnLogged(
    "api",
    "bash",
    [
      "-lc",
      `cd "${ACESTEP_DIR}" && ACESTEP_PATH="${ACESTEP_DIR}" ACESTEP_LM_BACKEND=mlx TOKENIZERS_PARALLELISM=false uv run acestep-api --host 127.0.0.1 --port ${PORTS.api}`,
    ],
    { cwd: ACESTEP_DIR }
  );

  onStatus("Starting backend server...");
  spawnLogged(
    "backend",
    "bash",
    [
      "-lc",
      `cd "${UI_SERVER_DIR}" && npm run build && PORT=${PORTS.backend} ACESTEP_PATH="${ACESTEP_DIR}" ACESTEP_API_URL=http://127.0.0.1:${PORTS.api} npm run start`,
    ],
    { cwd: UI_SERVER_DIR }
  );

  onStatus("Starting editor frontend...");
  spawnLogged(
    "frontend",
    "bash",
    [
      "-lc",
      `cd "${UI_DIR}" && npm run dev -- --host 127.0.0.1 --port ${PORTS.frontend} --strictPort`,
    ],
    { cwd: UI_DIR }
  );

  onStatus("Waiting for API health...");
  await waitForHttp(URLS.apiHealth);
  onStatus("Waiting for backend...");
  await waitForPort("UI backend", PORTS.backend);
  onStatus("Waiting for editor UI...");
  await waitForPort("UI frontend", PORTS.frontend);
  onStatus("Startup complete.");

  return { alreadyRunning: false, frontendUrl: URLS.frontend };
}

function killPidTree(pid) {
  if (!pid) return;
  const script = `
killtree() {
  local p="$1"
  for c in $(pgrep -P "$p" 2>/dev/null); do killtree "$c"; done
  kill -TERM "$p" 2>/dev/null || true
}
killtree_force() {
  local p="$1"
  for c in $(pgrep -P "$p" 2>/dev/null); do killtree_force "$c"; done
  kill -KILL "$p" 2>/dev/null || true
}
killtree ${pid}
sleep 1
killtree_force ${pid}
`;
  spawnSync("bash", ["-lc", script], { stdio: "ignore" });
}

async function stopAll() {
  const names = ["frontend", "backend", "api"];
  for (const name of names) {
    const pid = readPid(name);
    if (pid && isProcessAlive(pid)) {
      killPidTree(pid);
    }
    removePid(name);
  }
  managedChildren = [];
}

module.exports = {
  startAll,
  stopAll,
  LOG_DIR,
};
