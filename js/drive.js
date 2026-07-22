// --- Google Drive storage layer -------------------------------------------
// Uses the restrictive 'drive.file' scope: this app can only see/manage the
// single data file and media files it creates — nothing else in the user's
// Drive. Notes are kept in one small JSON file; Safe Place images/audio are
// uploaded as separate binary files and streamed on demand (never
// permanently saved to the device).

const DRIVE = (() => {
  const DATA_FILENAME = "emdr-companion-data.json";
  const SCOPE = "https://www.googleapis.com/auth/drive.file";

  let clientId = null;
  let tokenClient = null;
  let accessToken = localStorage.getItem("emdr_access_token") || null;
  let tokenExpiresAt = Number(localStorage.getItem("emdr_token_expires_at") || 0);
  let dataFileId = null;

  function persistToken() {
    if (accessToken) {
      localStorage.setItem("emdr_access_token", accessToken);
      localStorage.setItem("emdr_token_expires_at", String(tokenExpiresAt));
    } else {
      localStorage.removeItem("emdr_access_token");
      localStorage.removeItem("emdr_token_expires_at");
    }
  }

  function setClientId(id) {
    clientId = id;
    localStorage.setItem("emdr_client_id", id);
  }

  function getClientId() {
    return clientId || localStorage.getItem("emdr_client_id");
  }

  function loadGis() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts) return resolve();
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load Google sign-in script."));
      document.head.appendChild(s);
    });
  }

  async function ensureTokenClient() {
    await loadGis();
    const id = getClientId();
    if (!id) throw new Error("NO_CLIENT_ID");
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: SCOPE,
        callback: () => {}, // overridden per-call below
      });
    }
    return tokenClient;
  }

  function isSignedIn() {
    return !!accessToken && Date.now() < tokenExpiresAt;
  }

  async function signIn({ silentFirst = true } = {}) {
    const client = await ensureTokenClient();
    return new Promise((resolve, reject) => {
      client.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (resp.expires_in - 60) * 1000;
        persistToken();
        resolve(accessToken);
      };
      client.requestAccessToken({ prompt: silentFirst ? "" : "consent" });
    });
  }

  function signOut() {
    accessToken = null;
    tokenExpiresAt = 0;
    persistToken();
  }

  async function ensureToken() {
    if (isSignedIn()) return accessToken;
    return signIn({ silentFirst: false });
  }

  function authHeaders(extra = {}) {
    return { Authorization: `Bearer ${accessToken}`, ...extra };
  }

  async function findDataFile() {
    const q = encodeURIComponent(`name='${DATA_FILENAME}' and trashed=false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error("Could not search Drive for your data file.");
    const json = await res.json();
    return json.files && json.files[0] ? json.files[0].id : null;
  }

  function blankData(containerName) {
    return {
      version: 1,
      containerName: containerName || "My Container",
      createdAt: new Date().toISOString(),
      notes: [],
      skillUsageLog: [],
      safePlace: { name: "Safe Place", images: [], sounds: [] },
      settings: { weeklySummaryDay: "Sunday", lastSummaryShown: null },
      skills: {},
    };
  }

  async function createDataFile(initial) {
    const boundary = "emdrcompanion" + Math.random().toString(16).slice(2);
    const metadata = { name: DATA_FILENAME, mimeType: "application/json" };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
      JSON.stringify(initial) +
      `\r\n--${boundary}--`;

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": `multipart/related; boundary=${boundary}` }),
        body,
      }
    );
    if (!res.ok) throw new Error("Could not create your data file in Drive.");
    const json = await res.json();
    return json.id;
  }

  async function loadData() {
    await ensureToken();
    dataFileId = dataFileId || (await findDataFile());
    if (!dataFileId) {
      const initial = blankData();
      dataFileId = await createDataFile(initial);
      return initial;
    }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${dataFileId}?alt=media`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error("Could not read your data from Drive.");
    return res.json();
  }

  async function saveData(data) {
    await ensureToken();
    if (!dataFileId) dataFileId = await findDataFile();
    if (!dataFileId) {
      dataFileId = await createDataFile(data);
      return;
    }
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${dataFileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data),
      }
    );
    if (!res.ok) throw new Error("Could not save to Drive. Your changes may not be saved.");
  }

  async function uploadMedia(file) {
    await ensureToken();
    const boundary = "emdrcompanion" + Math.random().toString(16).slice(2);
    const metadata = { name: file.name, mimeType: file.type };
    const fileBuffer = await file.arrayBuffer();

    const head =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`;
    const tail = `\r\n--${boundary}--`;

    const body = new Blob([head, fileBuffer, tail]);

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
      {
        method: "POST",
        headers: authHeaders({ "Content-Type": `multipart/related; boundary=${boundary}` }),
        body,
      }
    );
    if (!res.ok) throw new Error("Could not upload that file to Drive.");
    return res.json(); // { id, name }
  }

  async function streamMedia(fileId) {
    await ensureToken();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: authHeaders() }
    );
    if (!res.ok) throw new Error("Could not load that file from Drive.");
    const blob = await res.blob();
    return URL.createObjectURL(blob); // caller should revoke when done
  }

  async function deleteMedia(fileId) {
    await ensureToken();
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  }

  return {
    setClientId,
    getClientId,
    isSignedIn,
    signIn,
    signOut,
    loadData,
    saveData,
    uploadMedia,
    streamMedia,
    deleteMedia,
    blankData,
  };
})();
