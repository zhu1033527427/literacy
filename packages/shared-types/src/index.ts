type NumberArray = number[];
export type Point = [number, number];
export interface StrokeData {
  strokes: string[];
  radStrokes?: NumberArray;
  medians: Point[][];
}
export * from "./material";
export * from "./literacy-api";
