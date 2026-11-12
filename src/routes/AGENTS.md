# Route conventions

- Every route declares `staticData.sitemap`; the sitemap derives URLs from the router and excludes the authenticated subtree to keep private pages out of search inventories.
- The dashboard's workflow-run list reuses `listMyRuns` and scopes its query cache by authenticated user so project and run views share the same owner-visible data.