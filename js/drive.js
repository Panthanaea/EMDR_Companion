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

  function redirectUri() {
    // The exact page URL (no hash/query) — this must be registered under
    // "Authorized redirect URIs" for the OAuth client, exactly as shown.
    return location.origin + location.pathname;
  }

  function isSignedIn() {
    return !!accessToken && Date.now() < tokenExpiresAt;
  }

  // Call once on every page load. If the page just came back from Google's
  // redirect, the token is sitting in the URL fragment — pull it out, save
  // it, and scrub the URL. We build the auth request ourselves (rather than
  // using Google's newer JS helper) because that helper's redirect mode
  // defaults to POSTing the token to the redirect page, which a static site
  // with no server can't read. Requesting response_type=token directly from
  // Google's classic endpoint returns the token in the URL fragment instead,
  // which plain client-side JS can read.
  function checkRedirectResult() {
    if (!location.hash || !location.hash.includes("access_token")) return false;
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get("access_token");
    const expiresIn = params.get("expires_in");
    const error = params.get("error");
    history.replaceState(null, "", location.pathname + location.search);
    if (error) {
      console.error("OAuth error:", error);
      return false;
    }
    if (!token) return false;
    accessToken = token;
    tokenExpiresAt = Date.now() + (Number(expiresIn || 3600) - 60) * 1000;
    persistToken();
    return true;
  }

  // Triggers a full-page redirect to Google. Nothing after this call runs in
  // this page life — the browser navigates away and the app reloads fresh
  // once Google sends it back to redirectUri() with the token in the hash.
  async function signIn() {
    const id = getClientId();
    if (!id) throw new Error("NO_CLIENT_ID");
    const params = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri(),
      response_type: "token",
      scope: SCOPE,
      include_granted_scopes: "true",
      prompt: "consent",
    });
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  }

  function signOut() {
    accessToken = null;
    tokenExpiresAt = 0;
    persistToken();
  }

  async function ensureToken() {
    if (isSignedIn()) return accessToken;
    throw new Error("NOT_SIGNED_IN");
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
      containerIcon: "jar",
      createdAt: new Date().toISOString(),
      notes: [],
      skillUsageLog: [],
      safePlace: { name: "Safe Place", icon: "trees", images: [], sounds: [] },
      settings: {
        weeklySummaryDay: "Sunday",
        lastSummaryShown: null,
        appearance: { bg: "#F2EDE4", accent: "#C97F4B", text: "#26332B", nightMode: false },
      },
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
    getRedirectUri: redirectUri,
    checkRedirectResult,
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
