/**
 * Catálogo centralizado das obras de Realidade Aumentada baseadas em geolocalização.
 * Cada entrada define metadados espaciais, coordenadas geográficas e parâmetros de escala 3D.
 */

export const INSTALLATIONS = Object.freeze([
  Object.freeze({
    id: '01',
    slug: 'mao-apontando',
    title: 'Mão Apontando',
    locationName: 'Meio do Cruzamento da Avenida da Universidade',
    latitude: -3.740955,
    longitude: -38.539123,
    modelUrl: new URL('../../assets/location/01_mao_apontando.glb', import.meta.url).href,
    elevationMeters: 2.2,
    targetDimensionMeters: 4.0,
    idleRotationSpeed: 0.25,
    levitationAmplitude: 0.18
  }),
  Object.freeze({
    id: '02',
    slug: 'mao-em-pe',
    title: 'Mão em Pé',
    locationName: 'Pátio Central IFCE',
    latitude: -3.744483,
    longitude: -38.536499,
    modelUrl: new URL('../../assets/location/02_mao_em_pe.glb', import.meta.url).href,
    elevationMeters: 2.0,
    targetDimensionMeters: 4.0,
    idleRotationSpeed: 0.25,
    levitationAmplitude: 0.16
  }),
  Object.freeze({
    id: '03',
    slug: 'origami',
    title: 'Origami',
    locationName: 'Lago do Jacarey',
    latitude: -3.800710,
    longitude: -38.490736,
    modelUrl: new URL('../../assets/location/origami.glb', import.meta.url).href,
    elevationMeters: 2.5,
    targetDimensionMeters: 4.8,
    idleRotationSpeed: 0.2,
    levitationAmplitude: 0.22
  }),
  Object.freeze({
    id: '04',
    slug: 'aviao-de-papel',
    title: 'Avião de Papel',
    locationName: 'Píer da Messejana',
    latitude: -3.831601,
    longitude: -38.497673,
    modelUrl: new URL('../../assets/location/aviao_de_papel.glb', import.meta.url).href,
    elevationMeters: 2.5,
    targetDimensionMeters: 4.5,
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

