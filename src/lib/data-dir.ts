import path from "node:path";

export function getDataDir(): string {
  // Permite sobreescribir la carpeta de datos por variable de entorno.
  const configuredDataDir = process.env.RENTIQ_DATA_DIR;
  if (configuredDataDir) {
    return path.resolve(configuredDataDir);
  }
  // Fallback local aislado para ejecución de V3.
  return path.join(process.cwd(), ".rentiq-v3-data");
}
