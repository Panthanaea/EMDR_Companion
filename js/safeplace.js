const SAFEPLACE = (() => {
  let activeImgUrl = null;
  let activeAudioUrl = null;
  let audioEl = null;

  function cleanup() {
    if (activeImgUrl) { URL.revokeObjectURL(activeImgUrl); activeImgUrl = null; }
    if (activeAudioUrl) { URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null; }
    if (audioEl) {
      audioEl.pause();
      audioEl.src = "";
      audioEl = null;
    }
  }

  async function open(safePlaceData, instructionsText) {
    const stage = document.createElement("div");
    stage.className = "safeplace-stage";
    stage.innerHTML = `
      <button class="safeplace-close" aria-label="Close">✕</button>
      <div class="safeplace-instructions" id="sp-instructions">
        <div class="safeplace-instructions-scrim"></div>
        <div class="safeplace-instructions-inner">
          <div class="safeplace-instructions-text" id="sp-instructions-text">${escapeHtml(instructionsText || "")}</div>
          <button class="safeplace-more" id="sp-more-btn" style="display:none;">More…</button>
        </div>
      </div>
    `;
    document.body.appendChild(stage);

    stage.querySelector(".safeplace-close").addEventListener("click", () => {
      cleanup();
      stage.remove();
    });

    // Only show "More…" if the collapsed panel actually clips the text.
    requestAnimationFrame(() => {
      const textEl = document.getElementById("sp-instructions-text");
      const moreBtn = document.getElementById("sp-more-btn");
      const panel = document.getElementById("sp-instructions");
      if (textEl && moreBtn && textEl.scrollHeight > textEl.clientHeight + 4) {
        moreBtn.style.display = "inline-flex";
        moreBtn.addEventListener("click", () => {
          const expanded = panel.classList.toggle("expanded");
          moreBtn.textContent = expanded ? "Less…" : "More…";
        });
      }
    });

    const imgId = safePlaceData.selectedImageId;
    if (imgId) {
      try {
        const url = await DRIVE.streamMedia(imgId);
        activeImgUrl = url;
        stage.style.backgroundImage = `url(${url})`;
      } catch (e) {
        console.error(e);
      }
    }

    const sndId = safePlaceData.selectedSoundId;
    if (sndId) {
      try {
        const url = await DRIVE.streamMedia(sndId);
        activeAudioUrl = url;
        audioEl = new Audio(url);
        audioEl.loop = true;
        audioEl.volume = 0.8;
        audioEl.play().catch(() => {
          const hint = document.createElement("button");
          hint.className = "btn btn-amber safeplace-play-hint";
          hint.textContent = "🔊 Play sound";
          hint.addEventListener("click", () => audioEl.play());
          stage.appendChild(hint);
        });
      } catch (e) {
        console.error(e);
      }
    }
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  return { open, cleanup };
})();
