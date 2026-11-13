/**
 * Catálogo centralizado das obras de Realidade Aumentada baseadas em geolocalização.
 * Cada entrada define metadados espaciais, coordenadas geográficas e parâmetros de escala 3D.
 */

export const INSTALLATIONS = Object.freeze([
  Object.freeze({
    id: '01',
    slug: 'av-da-universidade',
    title: 'Av da Universidade',
    locationName: 'Meio do Cruzamento da Avenida da Universidade',
    latitude: -3.740955,
    longitude: -38.539123,
    modelUrl: new URL('../../assets/location/01_mao_apontando.glb', import.meta.url).href,
    elevationMeters: 7.2,
    targetDimensionMeters: 7.2,
    defaultOffsetMeters: Object.freeze({ x: 0, y: 0, z: 7.25 }),
    defaultRotationDegrees: Object.freeze({ x: 0, y: 0, z: 0 }),
    idleRotationSpeed: 0.25,
    levitationAmplitude: 0.18
  }),
  Object.freeze({
    id: '02',
    slug: 'ifce-13-de-maio',
    title: 'IFCE 13 de Maio',
    locationName: 'Pátio Central IFCE',
    latitude: -3.744483,
    longitude: -38.536499,
    modelUrl: new URL('../../assets/location/02_mao_em_pe.glb', import.meta.url).href,
    elevationMeters: 7,
    targetDimensionMeters: 13,
    defaultOffsetMeters: Object.freeze({ x: -10, y: 0, z: 12.75 }),
    defaultRotationDegrees: Object.freeze({ x: -20, y: -8, z: -10 }),
    idleRotationSpeed: 0.25,
    levitationAmplitude: 0.16
  }),
  Object.freeze({
    id: '03',
    slug: 'jacarey',
    title: 'Jacarey',
    locationName: 'Lago do Jacarey',
    latitude: -3.800710,
    longitude: -38.490736,
    modelUrl: new URL('../../assets/location/origami.glb', import.meta.url).href,
    elevationMeters: -0.25,
    targetDimensionMeters: 19.2,
    // offsetMeters.y (-2.75m) já está consolidado em elevationMeters (2.5 - 2.75 = -0.25m) para evitar aplicação dupla.
    defaultOffsetMeters: Object.freeze({ x: 5.75, y: 0, z: -18 }),
    defaultRotationDegrees: Object.freeze({ x: 6, y: 6, z: 1 }),
    idleRotationSpeed: 0.2,
    levitationAmplitude: 0.22
  }),
  Object.freeze({
    id: '04',
    slug: 'messejana',
    title: 'Messejana',
    locationName: 'Píer da Messejana',
    latitude: -3.831601,
    longitude: -38.497673,
    modelUrl: new URL('../../assets/location/aviao_de_papel.glb', import.meta.url).href,
    elevationMeters: 14.5,
    targetDimensionMeters: 13.5,
    // offsetMeters.y (12m) já está consolidado em elevationMeters (2.5 + 12 = 14.5m) para evitar soma dupla na altura.
    defaultOffsetMeters: Object.freeze({ x: -2.75, y: 0, z: -12 }),
    defaultRotationDegrees: Object.freeze({ x: 50, y: 51, z: -13 }),
    idleRotationSpeed: 0.25,
    levitationAmplitude: 0.22
  })
]);

/**
 * Busca uma instalação pelo seu identificador numérico ('01', '02', '03').
 * @param {string} installationId
 * @returns {Readonly<object>}
 */
export function findInstallationById(installationId) {
  const installation = INSTALLATIONS.find((item) => item.id === installationId);
  if (!installation) {
    throw new Error(`Instalação "${installationId}" não encontrada no catálogo.`);
  }
  return installation;
}

