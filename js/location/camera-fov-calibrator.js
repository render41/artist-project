/**
 * Calibrador dinâmico do campo de visão (FOV) da câmera Three.js para alinhamento
 * com o stream real da câmera em smartphones Android (retrato e paisagem).
 */

const RADIANS_PER_DEGREE = Math.PI / 180;
const DEGREES_PER_RADIAN = 180 / Math.PI;

export const CAMERA_FOV_CONFIG = Object.freeze({
  minimumLongSideDegrees: 50,
  maximumLongSideDegrees: 95,
  defaultLongSideDegrees: 68,
  storageKey: 'artist.webar.cameraLongSideFovDegrees'
});

/**
 * Converte abertura angular proporcionalmente à razão geométrica de dimensões.
 * @param {number} angleDegrees
 * @param {number} ratio
 * @returns {number}
 */
export function scaleFieldOfViewDegrees(angleDegrees, ratio) {
  const halfAngleRadians = (angleDegrees / 2) * RADIANS_PER_DEGREE;
  return 2 * Math.atan(ratio * Math.tan(halfAngleRadians)) * DEGREES_PER_RADIAN;
}

/**
 * Limita o valor de FOV dentro da faixa segura suportada pela lente.
 * @param {number} valueDegrees
 * @returns {number}
 */
export function clampLongSideFovDegrees(valueDegrees) {
  if (!Number.isFinite(valueDegrees)) {
    return CAMERA_FOV_CONFIG.defaultLongSideDegrees;
  }
  return Math.min(
    Math.max(valueDegrees, CAMERA_FOV_CONFIG.minimumLongSideDegrees),
    CAMERA_FOV_CONFIG.maximumLongSideDegrees
  );
}

/**
 * Lê o FOV calibrado salvo localmente no navegador do aparelho, se existir.
 * @returns {number}
 */
export function loadSavedLongSideFovDegrees() {
  try {
    const rawValue = window.localStorage?.getItem(CAMERA_FOV_CONFIG.storageKey);
    if (!rawValue) {
      return CAMERA_FOV_CONFIG.defaultLongSideDegrees;
    }
    return clampLongSideFovDegrees(Number(rawValue));
  } catch (error) {
    console.warn('[CameraFovCalibrator] Não foi possível ler FOV salvo:', error);
    return CAMERA_FOV_CONFIG.defaultLongSideDegrees;
  }
}

/**
 * Salva o FOV calibrado para o aparelho atual no navegador.
 * @param {number} valueDegrees
 */
export function saveLongSideFovDegrees(valueDegrees) {
  try {
    window.localStorage?.setItem(
      CAMERA_FOV_CONFIG.storageKey,
      String(clampLongSideFovDegrees(valueDegrees))
    );
  } catch (error) {
    console.warn('[CameraFovCalibrator] Não foi possível salvar FOV:', error);
  }
}

/**
 * Calcula o FOV vertical exato da PerspectiveCamera compatível com `object-fit: cover`.
 * @param {object} params
 * @param {number} params.longSideFovDegrees Abertura da lente no eixo maior do sensor
 * @param {number} params.videoWidth Largura atual do elemento <video>
 * @param {number} params.videoHeight Altura atual do elemento <video>
 * @param {number} params.viewportWidth Largura atual do canvas
 * @param {number} params.viewportHeight Altura atual do canvas
 * @returns {number}
 */
export function computeCoveredVerticalFovDegrees({
  longSideFovDegrees,
  videoWidth,
  videoHeight,
  viewportWidth,
  viewportHeight
}) {
  const safeViewportWidth = Math.max(viewportWidth || 1, 1);
  const safeViewportHeight = Math.max(viewportHeight || 1, 1);
  const viewportAspect = safeViewportWidth / safeViewportHeight;

  if (videoWidth > 0 && videoHeight > 0) {
    const videoAspect = videoWidth / videoHeight;
    const isLandscapeVideo = videoAspect >= 1;

    const videoHorizontalFov = isLandscapeVideo
      ? longSideFovDegrees
      : scaleFieldOfViewDegrees(longSideFovDegrees, videoAspect);

    const videoVerticalFov = isLandscapeVideo
      ? scaleFieldOfViewDegrees(longSideFovDegrees, 1 / videoAspect)
      : longSideFovDegrees;

    if (viewportAspect < videoAspect) {
      return videoVerticalFov;
    }

    return scaleFieldOfViewDegrees(videoHorizontalFov, 1 / viewportAspect);
  }

  if (viewportAspect < 1) {
    return longSideFovDegrees;
  }

  return scaleFieldOfViewDegrees(longSideFovDegrees, 1 / viewportAspect);
}

/**
 * Cria o gerenciador responsável por manter o FOV da câmera 3D sincronizado com o vídeo.
 * @param {object} options
 * @param {() => THREE.PerspectiveCamera | null} options.getCamera
 * @param {() => HTMLVideoElement | null} options.getVideoElement
 * @param {() => { width: number, height: number }} options.getViewportDimensions
 * @param {number} [options.initialLongSideFovDegrees]
 */
export function createCameraFovCalibrator({
  getCamera,
  getVideoElement,
  getViewportDimensions,
  initialLongSideFovDegrees = loadSavedLongSideFovDegrees()
}) {
  let longSideFovDegrees = clampLongSideFovDegrees(initialLongSideFovDegrees);
  let lastAppliedVerticalFov = 0;

  function syncCameraFov() {
    const camera = getCamera();
    if (!camera) {
      return lastAppliedVerticalFov;
    }

    const { width: viewportWidth, height: viewportHeight } = getViewportDimensions();
    const videoElement = getVideoElement();

    const targetVerticalFov = computeCoveredVerticalFovDegrees({
      longSideFovDegrees,
      videoWidth: videoElement?.videoWidth || 0,
      videoHeight: videoElement?.videoHeight || 0,
      viewportWidth,
      viewportHeight
    });

    const targetAspect = Math.max(viewportWidth, 1) / Math.max(viewportHeight, 1);
    const fovChanged = Math.abs(camera.fov - targetVerticalFov) > 0.05;
    const aspectChanged = Math.abs(camera.aspect - targetAspect) > 0.001;

    if (fovChanged || aspectChanged) {
      camera.aspect = targetAspect;
      camera.fov = targetVerticalFov;
      camera.updateProjectionMatrix();
    }

    lastAppliedVerticalFov = targetVerticalFov;
    return targetVerticalFov;
  }

  function setLongSideFovDegrees(nextDegrees, { persist = true } = {}) {
    longSideFovDegrees = clampLongSideFovDegrees(nextDegrees);
    if (persist) {
      saveLongSideFovDegrees(longSideFovDegrees);
    }
    return syncCameraFov();
  }

  function resetToDefault() {
    longSideFovDegrees = CAMERA_FOV_CONFIG.defaultLongSideDegrees;
    saveLongSideFovDegrees(longSideFovDegrees);
    return syncCameraFov();
  }

  return {
    getLongSideFovDegrees: () => longSideFovDegrees,
    getAppliedVerticalFovDegrees: () => lastAppliedVerticalFov,
    setLongSideFovDegrees,
    resetToDefault,
    syncCameraFov
  };
}
