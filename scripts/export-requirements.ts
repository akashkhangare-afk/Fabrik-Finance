// Exports the requirements matrix to docs/REQUIREMENTS_MATRIX.md.
// Run: npm run docs:requirements   (Node 22.6+ with --experimental-strip-types)
import { writeFileSync } from "node:fs";
import { REQUIREMENTS, CONFLICTS } from "../src/content/requirements.ts";

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const by = (k: string) => REQUIREMENTS.filter((r) => r.classification === k).length;
const lines: string[] = [
  "# Fabrik Finance — Requirements Matrix",
  "",
  "_Generated from `src/content/requirements.ts` (also rendered in-app at `/ops/requirements` for Fabrik staff)._",
  "",
  "**Classification** — **A** PRD-confirmed · **B** proposed Fondo-inspired addition (not committed in the Expo MVP PRD) · **C** future or restricted capability.",
  "",
  "**Priority** — P0/P1/P2 from the Expo MVP PRD §32. *Candidate* = detailed in the earlier general MVP section of the PRD, retained but not Expo-prioritized. *Proposed* / *Future* / *Out of scope* as stated.",
  "",
  "**Sources** — `PRD p.N §X` = Fabrik Finance PRD.pdf · `Expo p.N` = the Expo MVP section of the same PDF (pp. 35–65) · `Gap` = Fondo vs Fabrik Finance PRD Missing Features Analysis.pdf.",
  "",
  `Totals: ${REQUIREMENTS.length} requirements — A ${by("A")} · B ${by("B")} · C ${by("C")} · implemented ${REQUIREMENTS.filter((r) => r.status.startsWith("Implemented")).length}.`,
  "",
  "| ID | Area | Requirement | Source | Persona | Screen | Data | Dependencies | Acceptance criteria | Priority | Status | Class | Notes |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...REQUIREMENTS.map((r) => `| ${r.id} | ${esc(r.area)} | **${esc(r.title)}** — ${esc(r.description)} | ${esc(r.source)} | ${esc(r.persona)} | \`${esc(r.screen)}\` | ${esc(r.data)} | ${esc(r.dependencies)} | ${esc(r.acceptance)} | ${r.priority} | ${r.status} | ${r.classification} | ${esc(r.notes ?? "")} |`),
  "",
  "## Documented conflicts",
  "",
  ...CONFLICTS.flatMap((c) => [`### ${c.id} · ${c.title}`, "", c.detail, "", `**Resolution:** ${c.resolution}`, ""]),
];
writeFileSync(new URL("../docs/REQUIREMENTS_MATRIX.md", import.meta.url), lines.join("\n"));
console.log(`Wrote docs/REQUIREMENTS_MATRIX.md (${REQUIREMENTS.length} requirements)`);
