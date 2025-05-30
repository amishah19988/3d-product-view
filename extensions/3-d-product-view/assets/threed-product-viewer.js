document.addEventListener("DOMContentLoaded", function () {
  const miShop = window.threedProductViewerShop.includes('://')
    ? window.threedProductViewerShop
    : `https://${window.threedProductViewerShop}`;
  const miProductId = window.threedProductId;

  if (!miShop || !miProductId) {
    console.error("Shop or Product ID not found.");
    return;
  }

  fetch(`/apps/threed/get-3d-model?shop=${encodeURIComponent(miShop)}&productId=${encodeURIComponent(`gid://shopify/Product/${miProductId}`)}`)
    .then((miRes) => {
      if (!miRes.ok) {
        console.error(`Model fetch failed: ${miRes.status} ${miRes.statusText}`);
        throw new Error("Failed to fetch 3D model");
      }
      return miRes.json();
    })
    .then((miResponse) => {
      const modelData = miResponse.model || {};
      const settings = miResponse.settings || {};

      if (settings.status !== "enable") {
        return;
      }

      if (!modelData.zipFile) {
        return;
      }

      miRenderModelViewer(settings, modelData, miProductId);
    })
    .catch((miErr) => console.error("3D model fetch error:", miErr));
});

function miCreateModelViewer(settings, model, miProductId, miForModal = false) {
  const miWidth = settings.width || null;
  const miHeight = settings.height || null;
  const miFeature = settings.otherFeatures || "Normal";
  const miFileName = model.zipFile.split('/').pop();
  const miModelPath = `/apps/threed/${miFileName}`;
  const miModelName = model.name || "3D Model";

  const miModelViewer = document.createElement("model-viewer");
  miModelViewer.setAttribute("alt", miModelName);
  miModelViewer.setAttribute("src", miModelPath);
  miModelViewer.setAttribute("camera-controls", "");
  miModelViewer.dataset.mediaId = `threed-viewer-${miProductId}`;

  if (miForModal) {
    miModelViewer.className = "global-media-settings global-media-settings--no-shadow";
    miModelViewer.style.width = "100%";
    miModelViewer.style.height = "auto";
    miModelViewer.style.maxWidth = "1100px";
    miModelViewer.style.aspectRatio = miWidth && miHeight ? `${miWidth}/${miHeight}` : "1/1";
    miModelViewer.setAttribute("loading", "lazy");
  } else {
    miModelViewer.style.width = miWidth ? `${miWidth}px` : "100%";
    miModelViewer.style.height = miHeight ? `${miHeight}px` : "auto";
    miModelViewer.style.maxWidth = "100%";
    miModelViewer.style.aspectRatio = miWidth && miHeight ? `${miWidth}/${miHeight}` : "1/1";
    miModelViewer.style.minHeight = "200px";
  }

  miModelViewer.addEventListener("error", (miEvent) => {
    console.error("Failed to load 3D model:", miEvent);
  });

  let miIsInteracting = false;
  let miAnimationFrameId = null;
  let miResumeTimeout = null;

  const miSetupInteractionHandling = () => {
    miModelViewer.addEventListener("camera-change", (miEvent) => {
      if (miEvent.detail.source === "user-interaction") {
        miIsInteracting = true;
        if (miAnimationFrameId) {
          cancelAnimationFrame(miAnimationFrameId);
          miAnimationFrameId = null;
        }
        if (miFeature === "Auto Rotate") {
          miModelViewer.removeAttribute("auto-rotate");
        }
        if (miResumeTimeout) {
          clearTimeout(miResumeTimeout);
          miResumeTimeout = null;
        }
      }
    });

    const miResumeAnimations = () => {
      if (!miIsInteracting) {
        return;
      }
      miIsInteracting = false;
      if (miFeature === "Auto Zoom in Zoom out and Rotate" && !miAnimationFrameId) {
        miAnimationFrameId = requestAnimationFrame(miAnimateCamera);
      } else if (miFeature === "Auto Rotate") {
        miModelViewer.setAttribute("auto-rotate", "");
        miModelViewer.setAttribute("auto-rotate-delay", "0");
        miModelViewer.setAttribute("rotation-per-second", "30deg");
      }
    };

    miModelViewer.addEventListener("pointerup", miResumeAnimations);
    miModelViewer.addEventListener("mouseup", miResumeAnimations);
    miModelViewer.addEventListener("pointerleave", miResumeAnimations);
    miModelViewer.addEventListener("pointerdown", () => {
      miModelViewer.setAttribute("camera-controls", "");
      miModelViewer.setAttribute("touch-action", "none");
      if (miResumeTimeout) {
        clearTimeout(miResumeTimeout);
      }
      miResumeTimeout = setTimeout(() => {
        miResumeAnimations();
      }, 100);
    });
  };

  miSetupInteractionHandling();

  let miControlsDiv;

  switch (miFeature) {
    case "Normal":
      miModelViewer.setAttribute("touch-action", "none");
      break;

    case "Auto Rotate":
      miModelViewer.setAttribute("auto-rotate", "");
      miModelViewer.setAttribute("auto-rotate-delay", "0");
      miModelViewer.setAttribute("rotation-per-second", "30deg");
      miModelViewer.setAttribute("touch-action", "none");
      break;

    case "Auto Zoom in Zoom out and Rotate":
      miModelViewer.setAttribute("interpolation-decay", "100");
      miModelViewer.setAttribute("auto-rotate", "");
      miModelViewer.setAttribute("touch-action", "none");

      const miKeyframes = [
        { orbit: "45deg 55deg 150m", fov: "40deg" },
        { orbit: "-60deg 110deg 100m", fov: "60deg" },
        { orbit: "0deg 75deg 120m", fov: "30deg" },
      ];

      let miCurrentIndex = 0;
      let miNextIndex = 1;
      let miTransitionStartTime = null;
      const miTransitionDuration = 3000;

      function miAnimateCamera(miTimestamp) {
        if (miIsInteracting) {
          miAnimationFrameId = null;
          return;
        }

        if (!miTransitionStartTime) {
          miTransitionStartTime = miTimestamp;
        }

        const miElapsed = miTimestamp - miTransitionStartTime;
        const miProgress = Math.min(miElapsed / miTransitionDuration, 1);

        const miCurrentKeyframe = miKeyframes[miCurrentIndex];
        const miNextKeyframe = miKeyframes[miNextIndex];

        const miCurrentOrbit = miCurrentKeyframe.orbit.split(" ");
        const miNextOrbit = miNextKeyframe.orbit.split(" ");
        const miCurrentTheta = parseFloat(miCurrentOrbit[0]);
        const miCurrentPhi = parseFloat(miCurrentOrbit[1]);
        const miCurrentRadius = parseFloat(miCurrentOrbit[2]);
        const miNextTheta = parseFloat(miNextOrbit[0]);
        const miNextPhi = parseFloat(miNextOrbit[1]);
        const miNextRadius = parseFloat(miNextOrbit[2]);

        const miCurrentFov = parseFloat(miCurrentKeyframe.fov);
        const miNextFov = parseFloat(miNextKeyframe.fov);

        const miInterpolatedTheta = miCurrentTheta + (miNextTheta - miCurrentTheta) * miProgress;
        const miInterpolatedPhi = miCurrentPhi + (miNextPhi - miCurrentPhi) * miProgress;
        const miInterpolatedRadius = miCurrentRadius + (miNextRadius - miCurrentRadius) * miProgress;
        const miInterpolatedFov = miCurrentFov + (miNextFov - miCurrentFov) * miProgress;

        miModelViewer.setAttribute("camera-orbit", `${miInterpolatedTheta}deg ${miInterpolatedPhi}deg ${miInterpolatedRadius}m`);
        miModelViewer.setAttribute("field-of-view", `${miInterpolatedFov}deg`);

        if (miProgress < 1) {
          miAnimationFrameId = requestAnimationFrame(miAnimateCamera);
        } else {
          miCurrentIndex = miNextIndex;
          miNextIndex = (miNextIndex + 1) % miKeyframes.length;
          miTransitionStartTime = null;
          miAnimationFrameId = requestAnimationFrame(miAnimateCamera);
        }
      }

      if (!miIsInteracting) {
        miAnimationFrameId = requestAnimationFrame(miAnimateCamera);
      }
      break;

    case "Rotate while Scrolling the Screen":
      miModelViewer.id = `scroll-demo-${miForModal ? 'modal' : 'gallery'}`;
      miModelViewer.setAttribute("touch-action", "none");
      miModelViewer.setAttribute(
        "camera-orbit",
        "calc(0deg + env(window-scroll-y) * 360deg) 75deg 120m"
      );

      function miUpdateScrollRotation() {
        if (!miIsInteracting) {
          miModelViewer.setAttribute(
            "camera-orbit",
            `calc(0deg + env(window-scroll-y) * 360deg) 75deg 120m`
          );
        }
      }

      window.addEventListener("scroll", miUpdateScrollRotation);
      miModelViewer.addEventListener("disconnected", () => {
        window.removeEventListener("scroll", miUpdateScrollRotation);
      }, { once: true });
      break;

    case "Manual Controls":
      miModelViewer.id = `transform-${miForModal ? 'modal' : 'gallery'}`;
      miModelViewer.setAttribute("camera-controls", "");
      miModelViewer.setAttribute("touch-action", "none");
      miModelViewer.setAttribute("interaction-prompt", "auto");
      miModelViewer.setAttribute("orientation", "20deg 0deg 0deg");
      miModelViewer.setAttribute("shadow-intensity", "1");

      miControlsDiv = document.createElement("div");
      miControlsDiv.className = "controls";
      miControlsDiv.innerHTML = `
        <div class="degree">
          <span>Roll:</span>
          <input id="roll-${miForModal ? 'modal' : 'gallery'}" value="20" size="3" class="number"> degrees
        </div>
        <div class="degree">
          <span>Pitch:</span>
          <input id="pitch-${miForModal ? 'modal' : 'gallery'}" value="0" size="3" class="number"> degrees
        </div>
        <div class="degree">
          <span>Yaw:</span>
          <input id="yaw-${miForModal ? 'modal' : 'gallery'}" value="0" size="3" class="number"> degrees
        </div>
        <button id="frame-${miForModal ? 'modal' : 'gallery'}" class="buttondegree">Update Framing</button>
      `;

      const miStopControlPropagation = (miEvent) => {
        miEvent.stopPropagation();
        const miTargetTag = miEvent.target.tagName.toLowerCase();
        if (miTargetTag === 'input' || miTargetTag === 'button') {
          return;
        }
        miEvent.preventDefault();
      };

      ['click', 'pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend'].forEach((miEventType) => {
        miControlsDiv.addEventListener(miEventType, miStopControlPropagation);
      });

      miControlsDiv.querySelectorAll('input').forEach((miInput) => {
        miInput.addEventListener('focus', () => console.log(`Input focused: ${miInput.id}`));
        miInput.addEventListener('input', () => console.log(`Input value changed: ${miInput.id} = ${miInput.value}`));
      });

      function miAttachControlListeners(miAttempt = 1, miMaxAttempts = 10) {
        const miRoll = document.querySelector(`#roll-${miForModal ? 'modal' : 'gallery'}`);
        const miPitch = document.querySelector(`#pitch-${miForModal ? 'modal' : 'gallery'}`);
        const miYaw = document.querySelector(`#yaw-${miForModal ? 'modal' : 'gallery'}`);
        const miFrame = document.querySelector(`#frame-${miForModal ? 'modal' : 'gallery'}`);

        if (!miRoll || !miPitch || !miYaw || !miFrame) {
          if (miAttempt <= miMaxAttempts) {
            console.warn(`Control inputs not found for feature: Manual Controls, attempt ${miAttempt}/${miMaxAttempts}`);
            setTimeout(() => miAttachControlListeners(miAttempt + 1, miMaxAttempts), 100);
          } else {
            console.error(`Failed to find control inputs after ${miMaxAttempts} attempts for feature: Manual Controls`);
          }
          return;
        }

        const miUpdateOrientation = () => {
          miModelViewer.setAttribute("orientation", `${miRoll.value}deg ${miPitch.value}deg ${miYaw.value}deg`);
        };

        miRoll.addEventListener("input", miUpdateOrientation);
        miPitch.addEventListener("input", miUpdateOrientation);
        miYaw.addEventListener("input", miUpdateOrientation);
        miFrame.addEventListener("click", () => {
          miModelViewer.updateFraming();
        });
      }

      setTimeout(() => miAttachControlListeners(), 0);
      break;

    case "Adjust Metalness and Roughness":
      miModelViewer.id = `material-${miForModal ? 'modal' : 'gallery'}`;
      miModelViewer.setAttribute("shadow-intensity", "1");
      miModelViewer.setAttribute("environment-image", "neutral");
      miModelViewer.setAttribute("touch-action", "none");

      const miControlsDivMaterial = document.createElement("div");
      miControlsDivMaterial.className = "controls";
      miControlsDivMaterial.innerHTML = `
        <div>
          <label for="metalness-${miForModal ? 'modal' : 'gallery'}">Metalness: <span id="metalness-value-${miForModal ? 'modal' : 'gallery'}">1.0</span></label>
          <input id="metalness-${miForModal ? 'modal' : 'gallery'}" type="range" min="0" max="1" step="0.01" value="1">
        </div>
        <div>
          <label for="roughness-${miForModal ? 'modal' : 'gallery'}">Roughness: <span id="roughness-value-${miForModal ? 'modal' : 'gallery'}">0.0</span></label>
          <input id="roughness-${miForModal ? 'modal' : 'gallery'}" type="range" min="0" max="1" step="0.01" value="0">
        </div>
      `;

      const miStopEventPropagationMaterial = (miEvent) => {
        miEvent.stopPropagation();
        const miTargetTag = miEvent.target.tagName.toLowerCase();
        const miEventType = miEvent.type;
        if (
          (miTargetTag === 'input' && ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].includes(miEventType))
        ) {
          return;
        }
        miEvent.preventDefault();
      };

      ['click', 'mousedown', 'mouseup', 'pointerdown', 'miEventType', 'touchstart', 'touchend'].forEach((miEventType) => {
        miControlsDivMaterial.addEventListener(miEventType, miStopEventPropagationMaterial);
      });

      if (miModelViewer.parentNode) {
        miModelViewer.parentNode.appendChild(miControlsDivMaterial);
      } else {
        miModelViewer.addEventListener("connected", () => {
          if (miModelViewer.parentNode) {
            miModelViewer.parentNode.appendChild(miControlsDivMaterial);
          }
        }, { once: true });
      }

      miModelViewer.addEventListener("load", () => {
        const miMaterials = miModelViewer.model?.materials;
        if (!miMaterials || miMaterials.length === 0) {
          console.warn("No materials found; hiding controls");
          miControlsDivMaterial.style.display = "none";
          return;
        }

        const miMaterial = miMaterials[0];
        const miMetalnessDisplay = document.querySelector(`#metalness-value-${miForModal ? 'modal' : 'gallery'}`);
        const miRoughnessDisplay = document.querySelector(`#roughness-value-${miForModal ? 'modal' : 'gallery'}`);
        const miMetalnessInput = document.querySelector(`#metalness-${miForModal ? 'modal' : 'gallery'}`);
        const miRoughnessInput = document.querySelector(`#roughness-${miForModal ? 'modal' : 'gallery'}`);

        miMetalnessDisplay.textContent = miMaterial.pbrMetallicRoughness.metallicFactor.toFixed(2);
        miRoughnessDisplay.textContent = miMaterial.pbrMetallicRoughness.roughnessFactor.toFixed(2);
        miMaterial.pbrMetallicRoughness.setBaseColorFactor([0.8, 0.6, 0.2, 1.0]);

        miMetalnessInput.addEventListener("input", (miEvent) => {
          const miValue = parseFloat(miEvent.target.value);
          miMaterial.pbrMetallicRoughness.setMetallicFactor(miValue);
          miMetalnessDisplay.textContent = miValue.toFixed(2);
        });

        miRoughnessInput.addEventListener("input", (miEvent) => {
          const miValue = parseFloat(miEvent.target.value);
          miMaterial.pbrMetallicRoughness.setRoughnessFactor(miValue);
          miRoughnessDisplay.textContent = miValue.toFixed(2);
        });
      });
      break;

    default:
      console.warn(`Unknown feature: ${miFeature}; defaulting to Normal`);
      miModelViewer.setAttribute("touch-action", "none");
      break;
  }

  return { miModelViewer, miControlsDiv };
}

function miRenderModelViewer(settings, model, miProductId) {
  const { miModelViewer: miGalleryModelViewer, miControlsDiv } = miCreateModelViewer(settings, model, miProductId, false);

  let miIsInteracting = false;
  miGalleryModelViewer.addEventListener('camera-change', (miEvent) => {
    if (miEvent.detail.source === 'user-interaction') {
      miIsInteracting = true;
      setTimeout(() => {
        miIsInteracting = false;
      }, 200);
    }
  });

  const miGallery = document.querySelector('.product__media-list') || 
                   document.querySelector('[data-gallery-role="gallery"]') || 
                   document.querySelector('ul[id*="Slider-Gallery"]');
  if (!miGallery) {
    console.error("Gallery container not found.");
    return;
  }

  const miExistingModalOpener = miGallery.querySelector('modal-opener');
  const miModalId = miExistingModalOpener?.dataset.modal;
  if (!miModalId) {
    console.error("Modal ID not found in gallery.");
    return;
  }

  const miListItem = document.createElement('li');
  miListItem.className = 'product__media-item grid__item slider__slide is-active';
  miListItem.id = `Slide-threed-viewer-${miProductId}`;
  miListItem.dataset.mediaId = `threed-viewer-${miProductId}`;
  miListItem.classList.add('scroll-trigger', 'animate--fade-in');

  const miMediaContainer = document.createElement('div');
  miMediaContainer.className = 'product-media-container media-type-model media-fit-contain global-media-settings gradient constrain-height';
  miMediaContainer.style.cssText = '--ratio: 1.0; --preview-ratio: 1.0;';

  const miMediaDiv = document.createElement('div');
  miMediaDiv.className = 'product__media media media--transparent';
  miMediaDiv.style.position = 'relative';
  miMediaDiv.appendChild(miGalleryModelViewer);

  if (miControlsDiv) {
    miMediaContainer.appendChild(miControlsDiv);
  }

  const miShop = window.threedProductViewerShop.includes('://')
    ? window.threedProductViewerShop
    : `https://${window.threedProductViewerShop}`;
  const miFullScreenLink = document.createElement("a");
  miFullScreenLink.id = "full-screen";
  miFullScreenLink.href = `/apps/threed/full-3d-model?shop=${encodeURIComponent(miShop)}&productId=${encodeURIComponent(`gid://shopify/Product/${miProductId}`)}`;
  miFullScreenLink.textContent = "Full Screen View";
  miFullScreenLink.style.display = "block";
  miFullScreenLink.style.textAlign = "right";
  miFullScreenLink.style.color = "#000";
  miFullScreenLink.style.fontSize = "15px";
  miFullScreenLink.style.border = "1px solid #77777740";
  miFullScreenLink.style.width = "fit-content";
  miFullScreenLink.style.padding = "5px 10px";
  miFullScreenLink.style.position = "absolute";
  miFullScreenLink.style.right = "0";
  miFullScreenLink.style.zIndex = "10";
  miMediaContainer.appendChild(miFullScreenLink);

  miMediaContainer.appendChild(miMediaDiv);
  miListItem.appendChild(miMediaContainer);
  miGallery.appendChild(miListItem);

  miGalleryModelViewer.setAttribute('camera-controls', '');
  miGalleryModelViewer.setAttribute('touch-action', 'none');
  miGalleryModelViewer.setAttribute('interaction-prompt', 'auto');
  miGalleryModelViewer.style.cursor = 'grab';

  ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend'].forEach(miEventType => {
    miGalleryModelViewer.addEventListener(miEventType, (miEvent) => {});
  });

  const miStopPropagation = (miEvent) => {
    const miTarget = miEvent.target;
    if (miTarget.closest('.controls') || miTarget.closest('a#full-screen')) {
      miEvent.stopPropagation();
      if (miTarget.tagName.toLowerCase() === 'input' || miTarget.tagName.toLowerCase() === 'button') {
        return;
      }
    }
  };

  ['click', 'pointerdown', 'mousedown', 'touchstart'].forEach(miEventType => {
    miMediaContainer.addEventListener(miEventType, miStopPropagation);
  });

  const miModalContent = document.querySelector(`${miModalId} .product-media-modal__content`);
  if (miModalContent) {
    const { miModelViewer: miModalModelViewer, miControlsDiv: miModalControlsDiv } = miCreateModelViewer(settings, model, miProductId, true);
    miModalContent.appendChild(miModalModelViewer);
    if (miModalControlsDiv) {
      miModalContent.appendChild(miModalControlsDiv);
    }
  } else {
    console.error(`Modal content for ${miModalId} not found.`);
  }

  const miStyle = document.createElement("style");
  miStyle.textContent = `
    #full-screen {
      display: block;
      text-align: right;
      color: #000;
      font-size: 15px;
      border: 1px solid #77777740;
      width: fit-content;
      padding: 5px 10px;
      position: absolute;
      right: 0;
      z-index: 10;
      cursor: pointer;
    }
    .controls {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(255, 255, 255, 0.8);
      padding: 10px;
      border-radius: 5px;
      z-index: 10;
      pointer-events: auto;
    }
    .controls input, .controls button {
      pointer-events: auto;
      user-select: auto;
      -webkit-user-select: auto;
      -moz-user-select: auto;
      -ms-user-select: auto;
      cursor: auto;
    }
    model-viewer {
      max-width: 100%;
      min-height: 200px;
      cursor: grab;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      pointer-events: auto;
    }
    model-viewer:active {
      cursor: grabbing;
    }
    .product__media-item[data-media-id="threed-viewer-${miProductId}"] {
      max-width: unset !important;
    }
    .buttondegree {
      display: none;
    }
    .product-media-modal__content model-viewer {
      width: 100%;
      height: auto;
      max-width: 1100px;
      margin: 0 auto;
      cursor: grab;
      touch-action: none;
      pointer-events: auto;
    }
    .product-media-modal__content model-viewer:active {
      cursor: grabbing;
    }
    .product-media-container {
      position: relative;
      pointer-events: auto;
    }
  `;
  document.head.appendChild(miStyle);
}