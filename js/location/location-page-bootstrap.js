import { startLocationArExperience } from './location-ar-experience.js';

/**
 * Inicializa uma página HTML de Location AR conectando o controlador aos IDs padrão do HUD.
 * @param {string} initialInstallationId
 */
export function bootLocationArPage(initialInstallationId) {
  const elements = {
    canvas: document.getElementById('webgl-canvas'),
    badgeElement: document.getElementById('installation-badge'),
    statusBox: document.getElementById('status-box'),
    gpsStatusBadge: document.getElementById('gps-status-badge'),
    compassDial: document.getElementById('compass-dial'),
    compassNeedle: document.getElementById('compass-needle'),
    directionTitleText: document.getElementById('direction-title-text'),
    directionHint: document.getElementById('direction-hint'),
    distanceText: document.getElementById('distance-text'),
    targetCoordsText: document.getElementById('target-coords-text'),
    alignedBadge: document.getElementById('aligned-badge'),
    centerReticle: document.getElementById('center-reticle'),
    progressContainer: document.getElementById('model-progress-container'),
    progressElement: document.getElementById('model-progress'),
    progressLabel: document.getElementById('model-progress-label'),
    buttonTargetReal: document.getElementById('btn-target-location'),
    buttonTargetAhead: document.getElementById('btn-target-ahead'),
    buttonTargetSimulate: document.getElementById('btn-target-simulate'),
    transformToggleButton: document.getElementById('btn-toggle-transform'),
    transformPanel: document.getElementById('transform-calib-panel'),
    installationButtons: Array.from(document.querySelectorAll('[data-installation-id]'))
  };

  startLocationArExperience({
    initialInstallationId,
    elements
  });
}

