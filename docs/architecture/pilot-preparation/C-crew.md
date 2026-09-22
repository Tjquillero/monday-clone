# C — Crew & Personnel Resolution Dossier (QA Remote)

**Environment:** QA_REMOTE_HTTPS (`https://qa-app.mantenix.net`)  
**Site:** Plaza Puerto Colombia  
**Board ID:** `3ea0326f-6ff7-409f-848a-1f296e6e3cc8`  

---

## Factual DB Resolution Evidence

### 1. Personnel Site Assignments
- **Source Table:** `personnel` + `personnel_site_assignments`
- **Leader Personnel ID:** `88d11174-be57-4f1f-acbd-927e16dad3b2` (CESAR AUGUSTO TERAN CASTELLAR - Role `ZD`)
- **Personnel Assigned to Site:**
  1. `88d11174-be57-4f1f-acbd-927e16dad3b2` — CESAR TERAN (Líder / ZD)
  2. `b9526eed-4dd4-4a8c-9942-c7b6779486de` — LUIS VARGAS (Operario / ZD)
  3. `efa247a3-dba3-484b-9ae9-020d00cb8119` — EPARQUIO ROJANO (Operario / ZV)
  4. `d31af1e1-a1ca-4d85-8d9b-6967ec2053f6` — REINALDO SARMIENTO (Operario / ZP)
- **Worker Count:** 4 operarios
- **Crew ID:** Dynamic resolution via `CrewAssignmentService` (0 fake `crew_assignments` table created).

---

**Verification Result:** 🟢 PASS — Real factual personnel site assignments resolved from database.
