import fs from 'fs';
import type { ProjectModel } from '../schemas/project-model.js';

export function writeJsonReport(
  model: ProjectModel,
  outputPath?: string
): void {
  const json = JSON.stringify(model, null, 2);
  if (outputPath) {
    fs.writeFileSync(outputPath, json, 'utf-8');
  } else {
    console.log(json);
  }
}
