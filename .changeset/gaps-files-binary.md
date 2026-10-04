---
'@orbitdocs/openapi': patch
---

Documentation gaps no longer report file downloads (a non-JSON response with a schema, such as a PDF or CSV) as missing a response schema, or binary file fields as missing an example. A DELETE with an empty body is not reported either.
