---
'@orbitdocs/nestjs': minor
---

Extraction sets `ORBITDOCS_EXTRACT=1` while it loads your Nest module, so the app can skip startup-only checks such as config validation that needs real secrets.
