/**
 * Controlador de interface do HUD espacial para Location AR.
 * Atualiza bússola direcional, distância, status acessível e barra de progresso 3D.
 */

const ALIGNMENT_THRESHOLD_DEGREES = 18.0;

/**
 * Formata uma distância em metros ou quilômetros de forma legível.
 * @param {number} distanceMeters
 * @returns {string}
 */
export function formatDistance(distanceMeters) {
  if (distanceMeters < 1000) {
    return `${distanceMeters.toFixed(1)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

/**
 * Cria o controlador de HUD vinculado aos elementos do DOM.
 * @param {object} elements
 * @returns {object}
 */
export function createSpatialHud(elements) {
  let isCurrentlyAligned = false;

  function setStatus(message) {
    if (elements.statusBox) {
      elements.statusBox.textContent = message;
    }
  }

  function setGpsBadge(message) {
    if (elements.gpsStatusBadge) {
      elements.gpsStatusBadge.textContent = message;
    }
  }

  function setTargetCoordinatesLabel(label) {
    if (elements.targetCoordsText) {
      elements.targetCoordsText.textContent = label;
    }
  }

  /**
   * Atualiza a barra nativa <progress> de carregamento do modelo GLB.
   * @param {number | null} ratio Valor entre 0 e 1, ou null para estado indeterminado.
   * @param {string} [label]
   */
  function showLoadingProgress(ratio, label = 'Carregando modelo 3D...') {
    if (!elements.progressContainer || !elements.progressElement) {
      return;
    }

    elements.progressContainer.hidden = false;

    if (typeof ratio === 'number') {
      const percentage = Math.round(ratio * 100);
      elements.progressElement.value = percentage;
      if (elements.progressLabel) {
        elements.progressLabel.textContent = `${label} ${percentage}%`;
      }
      return;
    }

    elements.progressElement.removeAttribute('value');
    if (elements.progressLabel) {
      elements.progressLabel.textContent = label;
    }
  }

  function hideLoadingProgress() {
    if (!elements.progressContainer) {
      return;
    }
    elements.progressContainer.hidden = true;
  }

  function setAlignedState(aligned) {
    if (aligned === isCurrentlyAligned) {
      return;
    }
    isCurrentlyAligned = aligned;

    elements.compassDial?.classList.toggle('is-aligned', aligned);
    elements.centerReticle?.classList.toggle('is-aligned', aligned);
    if (elements.alignedBadge) {
      elements.alignedBadge.hidden = !aligned;
    }
  }

  function buildYawGuidance(yawDegrees, absoluteYawDegrees) {
    if (absoluteYawDegrees >= 120) {
      return `Gire para trás ↻ (${Math.round(absoluteYawDegrees)}°)`;
    }
    if (yawDegrees > 16) {
      return `Gire para a direita → ${Math.round(yawDegrees)}°`;
    }
    if (yawDegrees < -16) {
      return `← Gire para a esquerda ${Math.round(absoluteYawDegrees)}°`;
    }
    return 'Alvo alinhado horizontalmente';
  }

  function buildPitchGuidance(pitchDegrees, absolutePitchDegrees) {
    if (pitchDegrees > 16) {
      return `Incline para cima ↑ (${Math.round(pitchDegrees)}°)`;
    }
    if (pitchDegrees < -16) {
      return `Incline para baixo ↓ (${Math.round(absolutePitchDegrees)}°)`;
    }
    return 'Mantenha na horizontal';
  }

  /**
   * Atualiza os indicadores espaciais com base nos ângulos suavizados e distância 3D.
   * @param {object} telemetry
   * @param {number} telemetry.yawDegrees
   * @param {number} telemetry.pitchDegrees
   * @param {number} telemetry.distanceMeters
   * @param {boolean} telemetry.isInFrontOfCamera
   * @param {string} telemetry.installationTitle
   */
  function updateOrientation({
    yawDegrees,
    pitchDegrees,
    distanceMeters,
    isInFrontOfCamera,
    installationTitle
  }) {
    const formattedDistance = formatDistance(distanceMeters);

    if (elements.distanceText) {
      elements.distanceText.textContent = `Distância: ${formattedDistance}`;
    }
    if (elements.compassNeedle) {
      elements.compassNeedle.style.transform = `rotate(${yawDegrees}deg)`;
    }

    const absoluteYaw = Math.abs(yawDegrees);
    const absolutePitch = Math.abs(pitchDegrees);
    const aligned = isInFrontOfCamera &&
      absoluteYaw < ALIGNMENT_THRESHOLD_DEGREES &&
      absolutePitch < ALIGNMENT_THRESHOLD_DEGREES;

    setAlignedState(aligned);

    if (aligned) {
      if (elements.directionTitleText) {
        elements.directionTitleText.textContent = 'Obra em mira • À sua frente';
      }
      if (elements.compassNeedle) {
        elements.compassNeedle.textContent = '◎';
      }
      if (elements.directionHint) {
        elements.directionHint.textContent = `${installationTitle} a ${formattedDistance}`;
      }
      setStatus(`${installationTitle} alinhada (${formattedDistance})`);
      return;
    }

    if (elements.compassNeedle) {
      elements.compassNeedle.textContent = '▲';
    }

    const yawGuidance = buildYawGuidance(yawDegrees, absoluteYaw);
    const pitchGuidance = buildPitchGuidance(pitchDegrees, absolutePitch);

    if (elements.directionTitleText) {
      elements.directionTitleText.textContent = yawGuidance;
    }
    if (elements.directionHint) {
      elements.directionHint.textContent = `${pitchGuidance} • Distância: ${formattedDistance}`;
    }
    setStatus(`${yawGuidance} • ${pitchGuidance}`);
  }

  return {
    setStatus,
    setGpsBadge,
    setTargetCoordinatesLabel,
    showLoadingProgress,
    hideLoadingProgress,
    updateOrientation
  };
}

