const SAFEPLACE = (() => {
  let activeUrls = [];
  let audioEl = null;
  let slideTimer = null;

  function cleanup() {
    activeUrls.forEach((u) => URL.revokeObjectURL(u));
    activeUrls = [];
    if (slideTimer) clearInterval(slideTimer);
    slideTimer = null;
    if (audioEl) {
      audioEl.pause();
      audioEl.src = "";
      audioEl = null;
    }
  }

  async function open(safePlaceData, onClose) {
    const stage = document.createElement("div");
    stage.className = "safeplace-stage";
    stage.innerHTML = `
      <div class="scrim"></div>
      <button class="safeplace-close" aria-label="Close">\u2715</button>
      <div class="safeplace-controls">
        <div class="display" style="color:#fff; font-size:20px;">${escapeHtml(safePlaceData.name || "Safe Place")}</div>
        <div class="small" style="color:#e8f0e6;">Breathe. Notice what you'd see, hear, and feel here.</div>
      </div>
    `;
    document.body.appendChild(stage);

    stage.querySelector(".safeplace-close").addEventListener("click", () => {
      cleanup();
      stage.remove();
      if (onClose) onClose();
    });

    // Load and cycle through images
    const images = safePlaceData.images || [];
    if (images.length) {
      let i = 0;
      const showImage = async (idx) => {
        try {
          const url = await DRIVE.streamMedia(images[idx].id);
          activeUrls.push(url);
          stage.style.backgroundImage = `url(${url})`;
        } catch (e) {
          console.error(e);
        }
      };
      await showImage(0);
      if (images.length > 1) {
        slideTimer = setInterval(() => {
          i = (i + 1) % images.length;
          showImage(i);
        }, 12000);
      }
    }

    // Play looping ambient sound (first sound in the list, if any)
    const sounds = safePlaceData.sounds || [];
    if (sounds.length) {
      try {
        const url = await DRIVE.streamMedia(sounds[0].id);
        activeUrls.push(url);
        audioEl = new Audio(url);
        audioEl.loop = true;
        audioEl.volume = 0.8;
        audioEl.play().catch(() => {
          // autoplay may be blocked until the user interacts; add a tap-to-play hint
          const hint = document.createElement("button");
          hint.className = "btn btn-amber";
          hint.textContent = "\ud83d\udd0a Play sound";
          hint.addEventListener("click", () => audioEl.play());
          stage.querySelector(".safeplace-controls").appendChild(hint);
        });
      } catch (e) {
        console.error(e);
      }
    }
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  return { open, cleanup };
})();
