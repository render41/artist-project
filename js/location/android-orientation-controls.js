import * as THREE from 'three';

/**
 * Controlador de orientação otimizado para Chrome/Android com fusão complementar
 * entre giroscópio (`deviceorientation` relativo) e bússola (`deviceorientationabsolute`),
 * filtragem de picos magnéticos, trava de norte e compensação manual de azimute.
 */

const DEVICE_TO_WORLD_QUATERNION = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const SCREEN_ROTATION_AXIS = new THREE.Vector3(0, 0, 1);
const WORLD_UP_AXIS = new THREE.Vector3(0, 1, 0);

const ORIENTATION_CONFIG = Object.freeze({
  minimumHorizontalProjection: 0.32,
  initialCircularSamples: 12,
  maxPairAgeMilliseconds: 350,
  normalCompassBlendRate: 0.03,
  normalMaxStepRadians: THREE.MathUtils.degToRad(0.45),
  outlierThresholdRadians: THREE.MathUtils.degToRad(26),
  outlierMaxStepRadians: THREE.MathUtils.degToRad(0.12),
  gyroStillSmoothing: 0.24,
  gyroMovingSmoothing: 0.52,
  compassOnlyStillSmoothing: 0.12,
  compassOnlyMovingSmoothing: 0.28,
  fastMovementThresholdRadians: THREE.MathUtils.degToRad(6),
  deadbandThresholdRadians: THREE.MathUtils.degToRad(0.06),
  headingStabilityDelayMilliseconds: 1800
});

/**
 * Normaliza qualquer ângulo em radianos para o intervalo [-PI, +PI].
 * @param {number} angleRadians
 * @returns {number}
 */
export function normalizeAngleRadians(angleRadians) {
  let wrapped = (angleRadians + Math.PI) % (2 * Math.PI);
  if (wrapped < 0) {
    wrapped += 2 * Math.PI;
  }
  return wrapped - Math.PI;
}

/**
 * Normaliza qualquer ângulo em graus para o intervalo [-180, +180].
 * @param {number} angleDegrees
 * @returns {number}
 */
export function normalizeAngleDegrees(angleDegrees) {
  let wrapped = (angleDegrees + 180) % 360;
  if (wrapped < 0) {
    wrapped += 360;
  }
  return wrapped - 180;
}

function detectIosSafariUserAgent() {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) &&
      navigator.maxTouchPoints != null &&
      navigator.maxTouchPoints > 1)
  );
}

/**
 * Converte ângulos W3C (alpha, beta, gamma) + rotação da tela em Quaternion de câmera Three.js.
 */
function buildCameraQuaternionFromEuler({
  alphaDegrees,
  betaDegrees,
  gammaDegrees,
  screenAngleDegrees,
  workingEuler,
  workingScreenQuaternion,
  targetQuaternion
}) {
  workingEuler.set(
    THREE.MathUtils.degToRad(betaDegrees),
    THREE.MathUtils.degToRad(alphaDegrees),
    -THREE.MathUtils.degToRad(gammaDegrees),
    'YXZ'
  );
  targetQuaternion.setFromEuler(workingEuler);
  targetQuaternion.multiply(DEVICE_TO_WORLD_QUATERNION);
  workingScreenQuaternion.setFromAxisAngle(
    SCREEN_ROTATION_AXIS,
    -THREE.MathUtils.degToRad(screenAngleDegrees)
  );
  targetQuaternion.multiply(workingScreenQuaternion);
  return targetQuaternion;
}

/**
 * Extrai o azimute horizontal (yaw ao redor de +Y) do eixo óptico da câmera.
 * Retorna null quando o aparelho está apontado muito próximo do zênite/nadir.
 */
function extractHorizontalYawRadians(quaternion, workingForwardVector) {
  workingForwardVector.set(0, 0, -1).applyQuaternion(quaternion);
  const horizontalMagnitude = Math.hypot(workingForwardVector.x, workingForwardVector.z);

  if (horizontalMagnitude < ORIENTATION_CONFIG.minimumHorizontalProjection) {
    return null;
  }

  return Math.atan2(-workingForwardVector.x, -workingForwardVector.z);
}

/**
 * Cria o controlador de orientação compatível com a interface esperada pelo LocAR.App.
 * @param {object} options
 * @param {THREE.Camera} options.camera
 * @param {(telemetry: object) => void} [options.onTelemetryChange]
 */
export function createAndroidOrientationControls({ camera, onTelemetryChange }) {
  const isIosDevice = detectIosSafariUserAgent();

  const workingEuler = new THREE.Euler();
  const workingScreenQuaternion = new THREE.Quaternion();
  const workingForwardVector = new THREE.Vector3();
  const workingYawOffsetQuaternion = new THREE.Quaternion();
  const workingTargetQuaternion = new THREE.Quaternion();

  const latestRelativeGyroQuaternion = new THREE.Quaternion();
  const latestAbsoluteQuaternion = new THREE.Quaternion();
  const smoothedOutputQuaternion = new THREE.Quaternion();

  let hasRelativeGyroSample = false;
  let hasAbsoluteCompassSample = false;
  let hasInitializedCameraPose = false;
  let latestRelativeTimestamp = 0;
  let latestAbsoluteTimestamp = 0;

  let screenOrientationDegrees = 0;
  let isEnabled = false;
  let isCompassLocked = false;
  let manualNorthOffsetDegrees = 0;

  // Estado da fusão complementar (bússola absoluta -> referencial suave do giroscópio)
  let compassToGyroOffsetRadians = 0;
  let hasConvergedInitialOffset = false;
  let circularOffsetSumSine = 0;
  let circularOffsetSumCosine = 0;
  let circularSampleCount = 0;
  let startedAtTimestamp = 0;

  function emitTelemetry() {
    if (!onTelemetryChange) {
      return;
    }

    let mode = 'waiting';
    if (hasRelativeGyroSample && hasAbsoluteCompassSample) {
      mode = isCompassLocked ? 'gyro-locked' : 'gyro-compass';
    } else if (hasRelativeGyroSample) {
      mode = 'gyro-only';
    } else if (hasAbsoluteCompassSample) {
      mode = 'compass-only';
    }

    onTelemetryChange({
      mode,
      isCompassLocked,
      manualNorthOffsetDegrees,
      hasRelativeGyroSample,
      hasAbsoluteCompassSample
    });
  }

  function updateScreenOrientationAngle() {
    screenOrientationDegrees = window.screen?.orientation?.angle ?? 0;
  }

  function applyCompassCorrectionSample() {
    if (isCompassLocked || !hasRelativeGyroSample || !hasAbsoluteCompassSample) {
      return;
    }

    const pairDeltaTime = Math.abs(latestAbsoluteTimestamp - latestRelativeTimestamp);
    if (pairDeltaTime > ORIENTATION_CONFIG.maxPairAgeMilliseconds) {
      return;
    }

    const absoluteYawRadians = extractHorizontalYawRadians(
      latestAbsoluteQuaternion,
      workingForwardVector
    );
    const relativeGyroYawRadians = extractHorizontalYawRadians(
      latestRelativeGyroQuaternion,
      workingForwardVector
    );

    if (absoluteYawRadians === null || relativeGyroYawRadians === null) {
      return;
    }

    const measuredOffsetRadians = normalizeAngleRadians(
      absoluteYawRadians - relativeGyroYawRadians
    );

    // Fase inicial: usa média circular para convergir rapidamente ao Norte real sem saltos.
    if (!hasConvergedInitialOffset) {
      circularOffsetSumSine += Math.sin(measuredOffsetRadians);
      circularOffsetSumCosine += Math.cos(measuredOffsetRadians);
      circularSampleCount += 1;
      compassToGyroOffsetRadians = Math.atan2(
        circularOffsetSumSine,
        circularOffsetSumCosine
      );

      const elapsedMilliseconds = performance.now() - startedAtTimestamp;
      if (
        circularSampleCount >= ORIENTATION_CONFIG.initialCircularSamples &&
        elapsedMilliseconds >= ORIENTATION_CONFIG.headingStabilityDelayMilliseconds
      ) {
        hasConvergedInitialOffset = true;
      }
      return;
    }

    // Fase estacionária: limita taxa máxima de mudança para impedir saltos por ruído magnético.
    const innovationRadians = normalizeAngleRadians(
      measuredOffsetRadians - compassToGyroOffsetRadians
    );
    const absoluteInnovation = Math.abs(innovationRadians);

    const maxStep =
      absoluteInnovation > ORIENTATION_CONFIG.outlierThresholdRadians
        ? ORIENTATION_CONFIG.outlierMaxStepRadians
        : ORIENTATION_CONFIG.normalMaxStepRadians;

    const proportionalStep = innovationRadians * ORIENTATION_CONFIG.normalCompassBlendRate;
    const clampedStep = THREE.MathUtils.clamp(proportionalStep, -maxStep, maxStep);
    compassToGyroOffsetRadians = normalizeAngleRadians(
      compassToGyroOffsetRadians + clampedStep
    );
  }

  function hasValidEulerNumbers(event) {
    return (
      typeof event.alpha === 'number' &&
      Number.isFinite(event.alpha) &&
      typeof event.beta === 'number' &&
      Number.isFinite(event.beta) &&
      typeof event.gamma === 'number' &&
      Number.isFinite(event.gamma)
    );
  }

  function handleAbsoluteOrientationEvent(event) {
    if (!hasValidEulerNumbers(event)) {
      return;
    }

    const normalizedAlpha = event.alpha < 0 ? event.alpha + 360 : event.alpha;
    buildCameraQuaternionFromEuler({
      alphaDegrees: normalizedAlpha,
      betaDegrees: event.beta,
      gammaDegrees: event.gamma,
      screenAngleDegrees: screenOrientationDegrees,
      workingEuler,
      workingScreenQuaternion,
      targetQuaternion: latestAbsoluteQuaternion
    });

    if (
      isIosDevice &&
      typeof event.webkitCompassHeading === 'number' &&
      Number.isFinite(event.webkitCompassHeading)
    ) {
      workingEuler.setFromQuaternion(latestAbsoluteQuaternion, 'YXZ');
      workingEuler.y =
        THREE.MathUtils.degToRad(360 - event.webkitCompassHeading) -
        THREE.MathUtils.degToRad(screenOrientationDegrees);
      latestAbsoluteQuaternion.setFromEuler(workingEuler);
    }

    const wasMissingAbsolute = !hasAbsoluteCompassSample;
    hasAbsoluteCompassSample = true;
    latestAbsoluteTimestamp = performance.now();

    applyCompassCorrectionSample();
    if (wasMissingAbsolute) {
      emitTelemetry();
    }
  }

  function handleDeviceOrientationEvent(event) {
    if (!hasValidEulerNumbers(event)) {
      return;
    }

    // No Android/iOS, se o próprio `deviceorientation` vier marcado como `absolute: true`
    // ou com bússola WebKit, ele representa orientação magnética absoluta e não giroscópio puro.
    if (
      event.absolute === true ||
      (isIosDevice && typeof event.webkitCompassHeading === 'number')
    ) {
      handleAbsoluteOrientationEvent(event);
      return;
    }

    const normalizedAlpha = event.alpha < 0 ? event.alpha + 360 : event.alpha;
    buildCameraQuaternionFromEuler({
      alphaDegrees: normalizedAlpha,
      betaDegrees: event.beta,
      gammaDegrees: event.gamma,
      screenAngleDegrees: screenOrientationDegrees,
      workingEuler,
      workingScreenQuaternion,
      targetQuaternion: latestRelativeGyroQuaternion
    });

    const wasMissingGyro = !hasRelativeGyroSample;
    hasRelativeGyroSample = true;
    latestRelativeTimestamp = performance.now();

    applyCompassCorrectionSample();
    if (wasMissingGyro) {
      emitTelemetry();
    }
  }

  function computeCombinedTargetQuaternion() {
    const manualOffsetRadians = THREE.MathUtils.degToRad(manualNorthOffsetDegrees);

    if (hasRelativeGyroSample) {
      const baseCompassYawOffset = hasAbsoluteCompassSample ? compassToGyroOffsetRadians : 0;
      const totalYawOffset = normalizeAngleRadians(baseCompassYawOffset + manualOffsetRadians);
      workingYawOffsetQuaternion.setFromAxisAngle(WORLD_UP_AXIS, totalYawOffset);
      workingTargetQuaternion
        .copy(workingYawOffsetQuaternion)
        .multiply(latestRelativeGyroQuaternion);
      return {
        quaternion: workingTargetQuaternion,
        usesGyro: true
      };
    }

    if (hasAbsoluteCompassSample) {
      workingYawOffsetQuaternion.setFromAxisAngle(WORLD_UP_AXIS, manualOffsetRadians);
      workingTargetQuaternion
        .copy(workingYawOffsetQuaternion)
        .multiply(latestAbsoluteQuaternion);
      return {
        quaternion: workingTargetQuaternion,
        usesGyro: false
      };
    }

    return null;
  }

  /**
   * Atualiza o quaternion da câmera com filtragem adaptativa. Chamado antes de cada render.
   */
  function update() {
    if (!isEnabled || !camera) {
      return;
    }

    const result = computeCombinedTargetQuaternion();
    if (!result) {
      return;
    }

    const { quaternion: targetQuaternion, usesGyro } = result;

    if (!hasInitializedCameraPose) {
      smoothedOutputQuaternion.copy(targetQuaternion);
      camera.quaternion.copy(smoothedOutputQuaternion);
      hasInitializedCameraPose = true;
      return;
    }

    const angularDifference = smoothedOutputQuaternion.angleTo(targetQuaternion);
    if (angularDifference < ORIENTATION_CONFIG.deadbandThresholdRadians) {
      return;
    }

    const movementRatio = Math.min(
      angularDifference / ORIENTATION_CONFIG.fastMovementThresholdRadians,
      1
    );

    const stillSmoothing = usesGyro
      ? ORIENTATION_CONFIG.gyroStillSmoothing
      : ORIENTATION_CONFIG.compassOnlyStillSmoothing;
    const movingSmoothing = usesGyro
      ? ORIENTATION_CONFIG.gyroMovingSmoothing
      : ORIENTATION_CONFIG.compassOnlyMovingSmoothing;

    const blendFactor = stillSmoothing + (movingSmoothing - stillSmoothing) * movementRatio;
    smoothedOutputQuaternion.slerp(targetQuaternion, blendFactor);
    camera.quaternion.copy(smoothedOutputQuaternion);
  }

  async function requestPermissionsIfRequired() {
    if (
      typeof window.DeviceOrientationEvent !== 'undefined' &&
      typeof window.DeviceOrientationEvent.requestPermission === 'function'
    ) {
      const permissionResult = await window.DeviceOrientationEvent.requestPermission();
      if (permissionResult !== 'granted') {
        throw new Error('Permissão de sensores de orientação negada.');
      }
    }
  }

  function connect() {
    if (isEnabled) {
      return;
    }

    updateScreenOrientationAngle();
    startedAtTimestamp = performance.now();
    isEnabled = true;

    window.addEventListener('orientationchange', updateScreenOrientationAngle);
    window.addEventListener('deviceorientation', handleDeviceOrientationEvent);
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', handleAbsoluteOrientationEvent);
    }

    emitTelemetry();
  }

  function disconnect() {
    if (!isEnabled) {
      return;
    }

    isEnabled = false;
    window.removeEventListener('orientationchange', updateScreenOrientationAngle);
    window.removeEventListener('deviceorientation', handleDeviceOrientationEvent);
    if ('ondeviceorientationabsolute' in window) {
      window.removeEventListener('deviceorientationabsolute', handleAbsoluteOrientationEvent);
    }
  }

  function setManualNorthOffsetDegrees(nextDegrees) {
    manualNorthOffsetDegrees = normalizeAngleDegrees(Number(nextDegrees) || 0);
    emitTelemetry();
    return manualNorthOffsetDegrees;
  }

  function setCompassLocked(locked) {
    isCompassLocked = Boolean(locked);
    emitTelemetry();
    return isCompassLocked;
  }

  function recalibrateNorthFromCompass() {
    isCompassLocked = false;
    hasConvergedInitialOffset = false;
    circularOffsetSumSine = 0;
    circularOffsetSumCosine = 0;
    circularSampleCount = 0;
    startedAtTimestamp = performance.now();
    emitTelemetry();
  }

  /**
   * Calcula e aplica o offset manual de Norte necessário para trazer horizontalmente
   * o ponto alvo atual para a direção frontal para onde a câmera está apontando.
   *
   * @param {THREE.Vector3} targetWorldPosition
   * @returns {number | null} Novo offset em graus ou null se não for possível calcular
   */
  function alignTargetBearingToCamera(targetWorldPosition) {
    if (!camera || !targetWorldPosition) {
      return null;
    }

    const deltaX = targetWorldPosition.x - camera.position.x;
    const deltaZ = targetWorldPosition.z - camera.position.z;
    if (Math.hypot(deltaX, deltaZ) < 0.1) {
      return null;
    }

    const desiredTargetYawRadians = Math.atan2(-deltaX, -deltaZ);
    const currentCameraYawRadians = extractHorizontalYawRadians(
      camera.quaternion,
      workingForwardVector
    );

    if (currentCameraYawRadians === null) {
      return null;
    }

    const requiredDeltaRadians = normalizeAngleRadians(
      desiredTargetYawRadians - currentCameraYawRadians
    );
    const nextOffsetDegrees = Math.round(
      normalizeAngleDegrees(
        manualNorthOffsetDegrees + THREE.MathUtils.radToDeg(requiredDeltaRadians)
      )
    );

    return setManualNorthOffsetDegrees(nextOffsetDegrees);
  }

  return {
    update,
    connect,
    disconnect,
    requestPermissionsIfRequired,
    setManualNorthOffsetDegrees,
    getManualNorthOffsetDegrees: () => manualNorthOffsetDegrees,
    setCompassLocked,
    isCompassLocked: () => isCompassLocked,
    recalibrateNorthFromCompass,
    alignTargetBearingToCamera
  };
}
