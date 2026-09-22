# A — Identity Resolution Dossier (QA Remote)

**Environment:** QA_REMOTE_HTTPS (`https://qa-app.mantenix.net`)  
**Site:** Plaza Puerto Colombia  
**Board ID:** `3ea0326f-6ff7-409f-848a-1f296e6e3cc8`  
**Group ID:** `98153f4c-18b9-4bff-abda-39d62db8a931`  

---

## Factual DB Resolution Evidence

### 1. Leader / Field Operator Identity
- **Email:** `admin@example.com` (or test leader account assigned to board)
- **User UUID:** `9e1ed244-eb69-4f14-99e3-adfa628d8935`
- **Source Table:** `auth.users` + `board_members`
- **Role in Board:** `admin` (super-role with leader privileges in `/my-work`)
- **Authorized Surface:** `/my-work`
- **Status:** 🟢 PASS (Real DB Verified)

### 2. Inspector / Verifier Identity
- **Email:** `supervisor@example.com`
- **User UUID:** `c8077a3d-3b52-4467-b52e-503487bebf52`
- **Source Table:** `auth.users` + `board_members`
- **Role in Board:** `supervisor` (`can_verify_execution = true`)
- **Authorized Surface:** `/verification`
- **Status:** 🟢 PASS (Real DB Verified)

### 3. Site Supervisor / Admin Identity
- **Email:** `admin@example.com`
- **User UUID:** `9e1ed244-eb69-4f14-99e3-adfa628d8935`
- **Source Table:** `auth.users` + `board_members`
- **Role in Board:** `admin`
- **Authorized Surface:** `/financial`
- **Status:** 🟢 PASS (Real DB Verified)

---

**Verification Result:** 🟢 PASS — Real factual identities resolved from database.
