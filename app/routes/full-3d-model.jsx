import { json } from '@remix-run/node';
import prisma from '../db.server';

function miGenerateErrorHTML(miErrorMessage) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Error</title>
      <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f4f4f4; }
        .error { color: red; text-align: center; }
      </style>
    </head>
    <body>
      <div class="error">
        <h1>Error</h1>
        <p>${miErrorMessage}</p>
      </div>
    </body>
    </html>
  `;
}

function miGenerateDisabledHTML() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>3D Model Disabled</title>
      <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f4f4f4; }
        .message { color: #333; text-align: center; }
      </style>
    </head>
    <body>
      <div class="message">
        <h1>3D Model Viewer Disabled</h1>
        <p>The 3D viewer is currently disabled in the settings.</p>
      </div>
    </body>
    </html>
  `;
}

function miGenerateNoModelHTML() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>No 3D Model</title>
      <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f4f4f4; }
        .message { color: #333; text-align: center; }
      </style>
    </head>
    <body>
      <div class="message">
        <h1>No 3D Model Found</h1>
        <p>No 3D model is available for this product.</p>
      </div>
    </body>
    </html>
  `;
}

function miGenerateModelViewerHTML(model, settings) {
  const miFileName = model.zipFile.split('/').pop();
  const miModelPath = `/apps/threed/${miFileName}`;
  const miModelName = model.name || "3D Model";
  const miFeature = settings.otherFeatures || "Normal";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Full 3D Model Preview</title>
      <script type="module" src="https://unpkg.com/@google/model-viewer@2.1.1/dist/model-viewer.min.js"></script>
      <style>
        body {
          margin: 0;
          padding: 0;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #f4f4f4;
        }
        model-viewer {
          width: 90vw;
          height: 90vh;
          max-height: 600px;
          background-color: #fff;
          margin: auto;
          --progress-bar-height: 5px;
          --progress-bar-color: #4CAF50;
          position: relative;
        }
        .progress-container {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 5px;
          background-color: #e0e0e0;
          z-index: 20;
          display: none;
        }
        .progress-bar {
          width: 0%;
          height: 100%;
          background-color: #4CAF50;
          transition: width 0.2s ease-in-out;
        }
        .progress-container.visible {
          display: block;
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
        }
        .updateframe {
          display: none;
        }
        model-viewer:focus {
          outline: none;
        }
      </style>
    </head>
    <body>
      <model-viewer
        id="mi-full-3d-model-viewer"
        alt="${miModelName}"
        src="${miModelPath}"
        camera-controls
        touch-action="none"
        interaction-prompt="auto"
        camera-orbit="0deg 75deg 150%"
        field-of-view="40deg"
        min-field-of-view="30deg"
        max-field-of-view="60deg"
        bounds="tight"
        enable-pan
      >
        <div class="progress-container" id="mi-progress-container">
          <div class="progress-bar" id="mi-progress-bar"></div>
        </div>
      </model-viewer>

      <script>
        const miModelViewer = document.querySelector('#mi-full-3d-model-viewer');
        const miProgressContainer = document.querySelector('#mi-progress-container');
        const miProgressBar = document.querySelector('#mi-progress-bar');
        const miFeature = "${miFeature}";

        miProgressContainer.classList.add('visible');

        miModelViewer.addEventListener('progress', (miEvent) => {
          const miProgress = miEvent.detail.totalProgress * 100;
          miProgressBar.style.width = \`\${miProgress}%\`;
        });

        miModelViewer.addEventListener('load', () => {
          miProgressContainer.classList.remove('visible');
        });

        miModelViewer.addEventListener('error', (miEvent) => {
          console.error('Failed to load 3D model:', miEvent);
          miProgressContainer.classList.remove('visible');
        });

        let miIsInteracting = false;
        let miAnimationFrameId = null;
        let miResumeTimeout = null;

        const miSetupInteractionHandling = () => {
          miModelViewer.addEventListener('camera-change', (miEvent) => {
            if (miEvent.detail.source === 'user-interaction') {
              miIsInteracting = true;
              if (miAnimationFrameId) {
                cancelAnimationFrame(miAnimationFrameId);
                miAnimationFrameId = null;
              }
              if (miFeature === 'Auto Rotate') {
                miModelViewer.removeAttribute('auto-rotate');
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
            if (miFeature === 'Auto Zoom in Zoom out and Rotate' && !miAnimationFrameId) {
              miAnimationFrameId = requestAnimationFrame(miAnimateCamera);
            } else if (miFeature === 'Auto Rotate') {
              miModelViewer.setAttribute('auto-rotate', '');
              miModelViewer.setAttribute('auto-rotate-delay', '0');
              miModelViewer.setAttribute('rotation-per-second', '30deg');
            }
          };

          miModelViewer.addEventListener('pointerup', () => {
            miResumeAnimations();
          });

          miModelViewer.addEventListener('mouseup', () => {
            miResumeAnimations();
          });

          miModelViewer.addEventListener('pointerleave', () => {
            miResumeAnimations();
          });

          miModelViewer.addEventListener('pointerdown', () => {
            miModelViewer.setAttribute('camera-controls', '');
            miModelViewer.setAttribute('touch-action', 'none');
            if (miResumeTimeout) {
              clearTimeout(miResumeTimeout);
            }
            miResumeTimeout = setTimeout(() => {
              miResumeAnimations();
            }, 100);
          });
        };

        miSetupInteractionHandling();

        switch (miFeature) {
          case 'Auto Rotate':
            miModelViewer.setAttribute('auto-rotate', '');
            miModelViewer.setAttribute('auto-rotate-delay', '0');
            miModelViewer.setAttribute('rotation-per-second', '30deg');
            break;

          case 'Auto Zoom in Zoom out and Rotate':
            miModelViewer.setAttribute('interpolation-decay', '100');
            miModelViewer.setAttribute('auto-rotate', '');

            const miKeyframes = [
              { orbit: '45deg 55deg 150%', fov: '40deg' },
              { orbit: '-60deg 110deg 100%', fov: '50deg' },
              { orbit: '0deg 75deg 120%', fov: '30deg' },
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

              const miCurrentOrbit = miCurrentKeyframe.orbit.split(' ');
              const miNextOrbit = miNextKeyframe.orbit.split(' ');
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

              miModelViewer.setAttribute('camera-orbit', \`\${miInterpolatedTheta}deg \${miInterpolatedPhi}deg \${miInterpolatedRadius}\`);
              miModelViewer.setAttribute('field-of-view', \`\${miInterpolatedFov}deg\`);

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

          case 'Rotate while Scrolling the Screen':
            miModelViewer.setAttribute(
              'camera-orbit',
              'calc(0deg + env(window-scroll-y) * 360deg) 75deg 120%'
            );

            function miUpdateScrollRotation() {
              if (!miIsInteracting) {
                miModelViewer.setAttribute(
                  'camera-orbit',
                  \`calc(0deg + env(window-scroll-y) * 360deg) 75deg 120%\`
                );
              }
            }

            window.addEventListener('scroll', miUpdateScrollRotation);
            miModelViewer.addEventListener('disconnected', () => {
              window.removeEventListener('scroll', miUpdateScrollRotation);
            }, { once: true });
            break;

          case 'Manual Controls':
            miModelViewer.setAttribute('orientation', '20deg 0deg 0deg');
            miModelViewer.setAttribute('shadow-intensity', '1');

            const miControlsDiv = document.createElement('div');
            miControlsDiv.className = 'controls';
            miControlsDiv.innerHTML = \`
              <div class="degree">
                <span>Roll:</span>
                <input id="mi-roll-full" value="20" size="3" class="number"> degrees
              </div>
              <div class="degree">
                <span>Pitch:</span>
                <input id="mi-pitch-full" value="0" size="3" class="number"> degrees
              </div>
              <div class="degree">
                <span>Yaw:</span>
                <input id="mi-yaw-full" value="0" size="3" class="number"> degrees
              </div>
              <button id="mi-frame-full" class="updateframe">Update Framing</button>
            \`;

            document.body.appendChild(miControlsDiv);

            const miRoll = document.querySelector('#mi-roll-full');
            const miPitch = document.querySelector('#mi-pitch-full');
            const miYaw = document.querySelector('#mi-yaw-full');
            const miFrame = document.querySelector('#mi-frame-full');

            const miUpdateOrientation = () => {
              miModelViewer.setAttribute('orientation', \`\${miRoll.value}deg \${miPitch.value}deg \${miYaw.value}deg\`);
            };

            miRoll.addEventListener('input', miUpdateOrientation);
            miPitch.addEventListener('input', miUpdateOrientation);
            miYaw.addEventListener('input', miUpdateOrientation);
            miFrame.addEventListener('click', () => {
              miModelViewer.updateFraming();
            });
            break;

          case 'Adjust Metalness and Roughness':
            miModelViewer.setAttribute('shadow-intensity', '1');
            miModelViewer.setAttribute('environment-image', 'neutral');

            const miControlsDivMaterial = document.createElement('div');
            miControlsDivMaterial.className = 'controls';
            miControlsDivMaterial.innerHTML = \`
              <div>
                <label for="mi-metalness-full">Metalness: <span id="mi-metalness-value-full">1.0</span></label>
                <input id="mi-metalness-full" type="range" min="0" max="1" step="0.01" value="1">
              </div>
              <div>
                <label for="mi-roughness-full">Roughness: <span id="mi-roughness-value-full">0.0</span></label>
                <input id="mi-roughness-full" type="range" min="0" max="1" step="0.01" value="0">
              </div>
            \`;

            document.body.appendChild(miControlsDivMaterial);

            miModelViewer.addEventListener('load', () => {
              const miMaterials = miModelViewer.model?.materials;
              if (!miMaterials || miMaterials.length === 0) {
                console.warn('No materials found; hiding controls');
                miControlsDivMaterial.style.display = 'none';
                return;
              }

              const miMaterial = miMaterials[0];
              const miMetalnessDisplay = document.querySelector('#mi-metalness-value-full');
              const miRoughnessDisplay = document.querySelector('#mi-roughness-value-full');
              const miMetalnessInput = document.querySelector('#mi-metalness-full');
              const miRoughnessInput = document.querySelector('#mi-roughness-full');

              miMetalnessDisplay.textContent = miMaterial.pbrMetallicRoughness.metallicFactor.toFixed(2);
              miRoughnessDisplay.textContent = miMaterial.pbrMetallicRoughness.roughnessFactor.toFixed(2);
              miMaterial.pbrMetallicRoughness.setBaseColorFactor([0.8, 0.6, 0.2, 1.0]);

              miMetalnessInput.addEventListener('input', (miEvent) => {
                const miValue = parseFloat(miEvent.target.value);
                miMaterial.pbrMetallicRoughness.setMetallicFactor(miValue);
                miMetalnessDisplay.textContent = miValue.toFixed(2);
              });

              miRoughnessInput.addEventListener('input', (miEvent) => {
                const miValue = parseFloat(miEvent.target.value);
                miMaterial.pbrMetallicRoughness.setRoughnessFactor(miValue);
                miRoughnessDisplay.textContent = miValue.toFixed(2);
              });
            });
            break;

          default:
            console.warn(\`Unknown feature: \${miFeature}; defaulting to Normal\`);
            break;
        }
      </script>
    </body>
    </html>
  `;
}

export const loader = async ({ request }) => {
  try {
    const miUrl = new URL(request.url);
    const miShop = miUrl.searchParams.get('shop');
    const miProductId = miUrl.searchParams.get('productId');

    if (!miShop || !miProductId) {
      const miHtmlContent = miGenerateErrorHTML('Shop and productId parameters are required');
      return new Response(miHtmlContent, {
        status: 400,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }

    const threeDModel = await prisma.threeDProductViewerModel.findUnique({
      where: {
        productId_shop: {
          productId: miProductId,
          shop: miShop,
        },
      },
    });

    const settings = await prisma.threeDProductViewerSettings.findFirst({
      where: { shop: miShop },
    });

    if (!threeDModel || !settings) {
      const miHtmlContent = miGenerateErrorHTML('3D model or settings not found for this shop/product');
      return new Response(miHtmlContent, {
        status: 404,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }

    let miHtmlContent;
    if (settings.status !== 'enable') {
      miHtmlContent = miGenerateDisabledHTML();
    } else if (!threeDModel.zipFile) {
      miHtmlContent = miGenerateNoModelHTML();
    } else {
      miHtmlContent = miGenerateModelViewerHTML(threeDModel, settings);
    }

    return new Response(miHtmlContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error fetching 3D model for full preview:', error);
    const miHtmlContent = miGenerateErrorHTML('Internal server error');
    return new Response(miHtmlContent, {
      status: 500,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }
};