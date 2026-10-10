/**
 * Componente A-Frame: ar-pose-stabilizer
 *
 * Filtro de pose adaptativo (estilo One-Euro Filter) para âncoras WebAR (NFT e marcadores).
 *
 * Elimina:
 * 1. Tremor severo à distância: o ruído homográfico de visão computacional aumenta com
 *    a distância Z. A zona morta e a taxa de amortecimento ajustam-se dinamicamente à distância
 *    para congelar o tremor quando o aparelho estiver parado, de perto ou de longe.
 * 2. Oscilação e rotação contínua (Anti-Spin): interpolação esférica (SLERP) suave com
 *    proteção contra ambiguidades planares e saltos angulares abruptos.
 * 3. Movimento fluido: interpolação responsiva que acompanha movimentos intencionais sem latência.
 */
AFRAME.registerComponent('ar-pose-stabilizer', {
  schema: {
    // Zona morta mínima de posição em milímetros (quando muito próximo)
    minPositionDeadband: { type: 'number', default: 2.0 },
    // Fator de tolerância de posição proporcional à distância da câmera
    distanceScaleFactor: { type: 'number', default: 0.016 },
    // Zona morta angular mínima em radianos (~0.9°)
    minRotationDeadband: { type: 'number', default: 0.015 },
    // Fator base de interpolação lenta (câmera imóvel ou quase parada)
    slowLerp: { type: 'number', default: 0.06 },
    // Fator base de interpolação rápida (movimento intencional)
    fastLerp: { type: 'number', default: 0.35 },
    // Limite de salto angular em radianos (~25°) para evitar giros espasmódicos
    maxAngularJump: { type: 'number', default: 0.44 },

    // Parâmetros legados para retrocompatibilidade
    positionDeadband: { type: 'number', default: -1 },
    rotationDeadband: { type: 'number', default: -1 },
    positionLerp: { type: 'number', default: -1 },
    rotationSlerp: { type: 'number', default: -1 }
  },

  init: function () {
    this.hasInitialPose = false;
    this.isTrackingActive = false;

    this.stablePosition = new THREE.Vector3();
    this.stableQuaternion = new THREE.Quaternion();
    this.rawPosition = new THREE.Vector3();
    this.rawQuaternion = new THREE.Quaternion();

    // Aplica retrocompatibilidade se atributos legados forem informados
    if (this.data.positionDeadband > 0) {
      this.data.minPositionDeadband = this.data.positionDeadband;
    }
    if (this.data.rotationDeadband > 0) {
      this.data.minRotationDeadband = this.data.rotationDeadband;
    }
    if (this.data.positionLerp > 0) {
      this.data.slowLerp = Math.min(this.data.slowLerp, this.data.positionLerp);
    }
    if (this.data.rotationSlerp > 0) {
      this.data.fastLerp = Math.max(this.data.fastLerp, this.data.rotationSlerp);
    }

    this.onMarkerFound = this.onMarkerFound.bind(this);
    this.onMarkerLost = this.onMarkerLost.bind(this);

    this.el.addEventListener('markerFound', this.onMarkerFound);
    this.el.addEventListener('markerLost', this.onMarkerLost);
  },

  onMarkerFound: function () {
    this.isTrackingActive = true;
    this.hasInitialPose = false;
  },

  onMarkerLost: function () {
    this.isTrackingActive = false;
    this.hasInitialPose = false;
  },

  tick: function () {
    if (!this.isTrackingActive) {
      return;
    }

    const currentObject3D = this.el.object3D;
    this.rawPosition.copy(currentObject3D.position);
    this.rawQuaternion.copy(currentObject3D.quaternion);

    // Na primeira detecção, adota a pose bruta imediatamente sem atraso
    if (!this.hasInitialPose) {
      this.stablePosition.copy(this.rawPosition);
      this.stableQuaternion.copy(this.rawQuaternion);
      this.hasInitialPose = true;
      return;
    }

    // Distância estimada da câmera até o marcador em milímetros (módulo do vetor de posição)
    const cameraDistance = this.rawPosition.length();

    // 1. Zona morta adaptativa calibrada para estabilizar à distância
    const dynamicPositionDeadband = Math.max(
      this.data.minPositionDeadband,
      cameraDistance * this.data.distanceScaleFactor
    );

    const dynamicRotationDeadband = Math.max(
      this.data.minRotationDeadband,
      (cameraDistance / 400) * 0.016
    );

    const positionDelta = this.stablePosition.distanceTo(this.rawPosition);
    const rotationDelta = this.stableQuaternion.angleTo(this.rawQuaternion);

    // 2. Interpolação de Posição com taxa adaptativa baseada na magnitude do movimento
    if (positionDelta > dynamicPositionDeadband) {
      // Se o movimento for muito pequeno, amortecimento forte; se for nítido e intencional, resposta rápida
      const positionAlpha = positionDelta > dynamicPositionDeadband * 2.2
        ? this.data.fastLerp
        : this.data.slowLerp;

      this.stablePosition.lerp(this.rawPosition, positionAlpha);
    }

    // 3. Interpolação de Orientação (SLERP com mitigação de pose flip)
    if (rotationDelta > dynamicRotationDeadband) {
      let rotationAlpha = rotationDelta > dynamicRotationDeadband * 2.2
        ? this.data.fastLerp
        : this.data.slowLerp;

      // Amortece inversões de normal planar (pose flip)
      if (rotationDelta > this.data.maxAngularJump) {
        rotationAlpha *= 0.15;
      }

      this.stableQuaternion.slerp(this.rawQuaternion, rotationAlpha);
    }

    // 4. Aplica as coordenadas estabilizadas no Object3D da cena
    currentObject3D.position.copy(this.stablePosition);
    currentObject3D.quaternion.copy(this.stableQuaternion);
  },

  remove: function () {
    this.el.removeEventListener('markerFound', this.onMarkerFound);
    this.el.removeEventListener('markerLost', this.onMarkerLost);
  }
});
