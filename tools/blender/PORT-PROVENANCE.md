# Port provenance — tools/blender

Source project `D:\dev\f3\guitar-tutor` is READ-ONLY. Verified unchanged:
no file below was edited, added, or removed there.

| File | Role | SHA-256 (source, at port time) | Local copy |
|---|---|---|---|
| `tools/guitar-finish-studio/validate-glb.mjs` | design reference only (rewritten, not copied) | `7D2CBCBB…DC7B75` | `tools/blender/validate-glb.mjs` (new implementation: preflight/output split, caps, classification, tri accounting, `--target-tris`) |
| `tools/guitar-finish-studio/repair-zero-tangents.py` | copied verbatim | `7EAB0A5B…62E38FB8C` | `tools/blender/repair-zero-tangents.py` (hash-identical) |
| `node_modules/gltf-validator` | NOT copied; installed fresh from npm registry | — | `tools/blender/node_modules/gltf-validator@2.0.0-dev.3.10` (same pinned version) |

Notices preserved:
- guitar-tutor: MIT License, (c) 2026 unexpear and StandardTune contributors
  (see `D:\dev\f3\guitar-tutor\LICENSE`). `repair-zero-tangents.py` carries
  its own docstring stating scope and fallback-reporting requirement.
- `gltf-validator` 2.0.0-dev.3.10: Apache-2.0; LICENSE and NOTICES kept in
  `tools/blender/node_modules/gltf-validator/`.
- Blender flag/audit patterns (`--background --factory-startup
  --disable-autoexec --python-exit-code 1`) follow the audited guitar-tutor
  usage; no guitar geometry, materials, or product code was ported.

Guitar-specific geometry stays in guitar-tutor. Re-verify source hashes
before any future re-port.
