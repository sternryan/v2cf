import fs from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface ScreenshotComparisonResult {
  mismatchPercentage: number;
  diffImagePath: string;
  width: number;
  height: number;
}

/**
 * Compare two PNG screenshots using pixelmatch and produce a diff image.
 *
 * Returns the mismatch percentage (0-100) and writes a visual diff PNG to diffOutputPath.
 * If dimensions differ, returns 100% mismatch without creating a meaningful diff.
 */
export async function compareScreenshots(
  sourcePath: string,
  targetPath: string,
  diffOutputPath: string
): Promise<ScreenshotComparisonResult> {
  const sourceBuffer = fs.readFileSync(sourcePath);
  const targetBuffer = fs.readFileSync(targetPath);

  const sourceImg = PNG.sync.read(sourceBuffer);
  const targetImg = PNG.sync.read(targetBuffer);

  // If dimensions differ, return 100% mismatch
  if (
    sourceImg.width !== targetImg.width ||
    sourceImg.height !== targetImg.height
  ) {
    console.warn(
      `[v2cf] Screenshot dimensions differ: source ${sourceImg.width}x${sourceImg.height} vs target ${targetImg.width}x${targetImg.height}`
    );
    return {
      mismatchPercentage: 100,
      diffImagePath: diffOutputPath,
      width: 0,
      height: 0,
    };
  }

  const { width, height } = sourceImg;
  const diff = new PNG({ width, height });

  const numDiffPixels = pixelmatch(
    sourceImg.data,
    targetImg.data,
    diff.data,
    width,
    height,
    { threshold: 0.1, includeAA: false }
  );

  const mismatchPercentage = (numDiffPixels / (width * height)) * 100;

  // Write diff image to output path
  fs.writeFileSync(diffOutputPath, PNG.sync.write(diff));

  return {
    mismatchPercentage,
    diffImagePath: diffOutputPath,
    width,
    height,
  };
}
