# Required Check Contract

The active `main` repository ruleset must require exactly these GitHub Actions check contexts:

- `Required CI`
- `Required CodeQL`

These names are a public branch-protection contract. Internal job names, matrices, path filters,
and workflow organization may change, but the two required job names above must not be renamed or
removed as part of ordinary CI maintenance.

`Required CI` aggregates every applicable CI job. Selective jobs may report `skipped`; any job that
runs must succeed. `Required CodeQL` succeeds only when the CodeQL analysis job succeeds.

If a future migration truly requires a new context name:

1. Add the new gate without removing the existing gate.
2. Allow both names to report successfully on `main` and a pull request.
3. Update the repository ruleset to the new name.
4. Remove the old gate in a later pull request.

Never rename a required gate and update the ruleset in the same unverified step.
