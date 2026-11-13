/**
 * Estabilizador de leituras GPS para dispositivos móveis: filtra picos imprecisos,
 * elimina tremor com usuário parado (zona morta) e oferece trava manual de posição.
 */

const EARTH_RADIUS_METERS = 6371000;

export const GPS_STABILIZER_CONFIG = Object.freeze({
  preferredAccuracyMeters: 30,
  emergencyMaxAccuracyMeters: 120,
  emergencyFallbackDelayMilliseconds: 4500,
  maxAccuracyDegradationRatio: 2.4,
  stationaryDeadbandMeters: 1.8,
  accuracyImprovementRatio: 0.65,
  walkingThresholdMeters: 5.5,
  driftBlendFactor: 0.28,
  walkingBlendFactor: 0.6,
  significantAccuracySnapMeters: 12,
  poorCurrentAccuracyMeters: 25
});

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calcula a distância Haversine em metros entre duas coordenadas geográficas.
 * @param {{ latitude: number, longitude: number }} origin
 * @param {{ latitude: number, longitude: number }} destination
 * @returns {number}
 */
export function calculateHaversineDistanceMeters(origin, destination) {
  const deltaLatitude = toRadians(destination.latitude - origin.latitude);
  const deltaLongitude = toRadians(destination.longitude - origin.longitude);
  const originLatitudeRadians = toRadians(origin.latitude);
  const destinationLatitudeRadians = toRadians(destination.latitude);

  const halfChordSquared =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(originLatitudeRadians) *
      Math.cos(destinationLatitudeRadians) *
      Math.sin(deltaLongitude / 2) ** 2;

  const angularDistance =
    2 * Math.atan2(Math.sqrt(halfChordSquared), Math.sqrt(Math.max(1 - halfChordSquared, 0)));

  return EARTH_RADIUS_METERS * angularDistance;
}

/**
 * Cria o gerenciador estabilizado de geolocalização contínua.
 * @param {object} options
 * @param {(coords: { latitude: number, longitude: number, accuracy: number }) => void} options.onPositionUpdate
 * @param {(status: { accuracy: number, isLocked: boolean, isDiscarded: boolean }) => void} [options.onSignalStatus]
 * @param {(error: GeolocationPositionError | Error) => void} [options.onError]
 */
export function createGpsStabilizer({ onPositionUpdate, onSignalStatus, onError }) {
  let watchId = null;
  let startedAtMilliseconds = 0;
  let isLocked = false;
  let isPaused = false;

  let stabilizedPosition = null;
  let latestRawPosition = null;
  let bestObservedAccuracyMeters = Infinity;

  function emitSignalStatus(accuracy, isDiscarded) {
    onSignalStatus?.({
      accuracy,
      isLocked,
      isDiscarded
    });
  }

  function shouldRejectSample(accuracyMeters) {
    if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
      return true;
    }

    if (accuracyMeters > GPS_STABILIZER_CONFIG.emergencyMaxAccuracyMeters) {
      return true;
    }

    if (stabilizedPosition) {
      const allowedAccuracyLimit = Math.max(
        GPS_STABILIZER_CONFIG.preferredAccuracyMeters,
        bestObservedAccuracyMeters * GPS_STABILIZER_CONFIG.maxAccuracyDegradationRatio
      );
      if (accuracyMeters > allowedAccuracyLimit) {
        return true;
      }
    } else {
      const elapsedMilliseconds = performance.now() - startedAtMilliseconds;
      const withinInitialQualityWindow =
        elapsedMilliseconds < GPS_STABILIZER_CONFIG.emergencyFallbackDelayMilliseconds;
      if (
        withinInitialQualityWindow &&
        accuracyMeters > GPS_STABILIZER_CONFIG.preferredAccuracyMeters
      ) {
        return true;
      }
    }

    return false;
  }

  function applySample(incomingPosition) {
    const incomingAccuracy = incomingPosition.accuracy;
    latestRawPosition = incomingPosition;

    if (shouldRejectSample(incomingAccuracy)) {
      emitSignalStatus(incomingAccuracy, true);
      return;
    }

    bestObservedAccuracyMeters = Math.min(bestObservedAccuracyMeters, incomingAccuracy);

    if (isLocked || isPaused) {
      emitSignalStatus(incomingAccuracy, false);
      return;
    }

    if (!stabilizedPosition) {
      stabilizedPosition = { ...incomingPosition };
      emitSignalStatus(incomingAccuracy, false);
      onPositionUpdate({ ...stabilizedPosition });
      return;
    }

    const movedMeters = calculateHaversineDistanceMeters(stabilizedPosition, incomingPosition);
    const hasMuchBetterAccuracy =
      incomingAccuracy <= stabilizedPosition.accuracy * GPS_STABILIZER_CONFIG.accuracyImprovementRatio;

    const shouldSnapPoorToAccurate =
      stabilizedPosition.accuracy >= GPS_STABILIZER_CONFIG.poorCurrentAccuracyMeters &&
      incomingAccuracy <= GPS_STABILIZER_CONFIG.significantAccuracySnapMeters;

    if (
      !shouldSnapPoorToAccurate &&
      !hasMuchBetterAccuracy &&
      movedMeters < GPS_STABILIZER_CONFIG.stationaryDeadbandMeters
    ) {
      // Usuário parado: ignora micro-oscilação normal do chip GPS para evitar tremor do objeto.
      emitSignalStatus(incomingAccuracy, false);
      return;
    }

    const blendFactor = shouldSnapPoorToAccurate
      ? 0.92
      : movedMeters >= GPS_STABILIZER_CONFIG.walkingThresholdMeters
        ? GPS_STABILIZER_CONFIG.walkingBlendFactor
        : GPS_STABILIZER_CONFIG.driftBlendFactor;

    stabilizedPosition = {
      latitude:
        stabilizedPosition.latitude +
        (incomingPosition.latitude - stabilizedPosition.latitude) * blendFactor,
      longitude:
        stabilizedPosition.longitude +
        (incomingPosition.longitude - stabilizedPosition.longitude) * blendFactor,
      accuracy: Math.min(
        stabilizedPosition.accuracy + (incomingAccuracy - stabilizedPosition.accuracy) * blendFactor,
        incomingAccuracy * 1.4
      )
    };

    emitSignalStatus(incomingAccuracy, false);
    onPositionUpdate({ ...stabilizedPosition });
  }

  function handleGeolocationSuccess(position) {
    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    applySample({
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : 50
    });
  }

  function start() {
    if (watchId !== null) {
      return true;
    }

    if (!navigator.geolocation) {
      onError?.(new Error('Geolocalização não suportada neste navegador.'));
      return false;
    }

    startedAtMilliseconds = performance.now();
    watchId = navigator.geolocation.watchPosition(
      handleGeolocationSuccess,
      (error) => {
        onError?.(error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1500,
        timeout: 15000
      }
    );

    return true;
  }

  function stop() {
    if (watchId === null) {
      return;
    }
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  function setLocked(locked) {
    isLocked = Boolean(locked);
    if (latestRawPosition) {
      emitSignalStatus(latestRawPosition.accuracy, false);
    }
    return isLocked;
  }

  function setPaused(paused) {
    isPaused = Boolean(paused);
  }

  /**
   * Limpa o histórico suavizado para aceitar imediatamente o sinal atual mais limpo.
   */
  function reanchor() {
    isLocked = false;
    bestObservedAccuracyMeters = Infinity;
    startedAtMilliseconds = performance.now();

    if (latestRawPosition && latestRawPosition.accuracy <= GPS_STABILIZER_CONFIG.emergencyMaxAccuracyMeters) {
      stabilizedPosition = { ...latestRawPosition };
      bestObservedAccuracyMeters = latestRawPosition.accuracy;
      emitSignalStatus(latestRawPosition.accuracy, false);
      onPositionUpdate({ ...stabilizedPosition });
      return stabilizedPosition;
    }

    stabilizedPosition = null;
    return null;
  }

  return {
    start,
    stop,
    setLocked,
    setPaused,
    reanchor,
    isLocked: () => isLocked,
    getStabilizedPosition: () => (stabilizedPosition ? { ...stabilizedPosition } : null)
  };
}
