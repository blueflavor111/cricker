import { readFileSync } from "node:fs";
import type { Bundle } from "../src/engine/types";

export const load = (id: string): Bundle => JSON.parse(readFileSync(new URL(`../public/data/${id}.json`, import.meta.url), "utf8"));
