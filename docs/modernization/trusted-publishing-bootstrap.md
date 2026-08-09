# Trusted-publishing bootstrap

`image-fingerprint` must exist on npm before its package settings can accept a trusted publisher.
Use one manual prerelease to claim the package, validate OIDC with a second prerelease, and publish
the stable version only after that validation succeeds.

## 1. Merge the bootstrap candidate

Merge the release-hardening changes with `package.json` set to `0.1.0-rc.0`. Confirm all required
checks pass on `main`. Do not create or push a `v0.1.0-rc.0` Git tag: the trusted publisher does not
exist yet, so the release workflow cannot authenticate.

From a clean checkout of that exact `main` commit, run the local gates again:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm pack:check
npm publish --access public --tag next
```

The final command is the only manual publish. It requires an interactively authenticated npm account
with 2FA or a short-lived granular access token allowed to publish. Never place that credential in
the repository or GitHub Actions.

Verify that the prerelease did not create a stable `latest` tag:

```bash
npm view image-fingerprint@next version
npm view image-fingerprint dist-tags --json
```

The expected `next` value is `0.1.0-rc.0`; `latest` should still be absent.

## 2. Configure npm trusted publishing

On npmjs.com, open **image-fingerprint → Settings → Trusted publishing**, choose GitHub Actions, and
enter these exact values:

- Organization or user: `dills122`
- Repository: `image-fingerprint`
- Workflow filename: `release.yml`
- Environment: leave blank
- Allowed actions: `npm publish`

The workflow grants `id-token: write`, uses a GitHub-hosted runner, and publishes without a token.
The `repository.url` in `package.json` exactly matches the GitHub repository.

## 3. Prove OIDC with a second candidate

Bump `package.json` to `0.1.0-rc.1` in a new pull request, merge it after all required checks pass,
and tag the current `main` commit:

```bash
git tag -s v0.1.0-rc.1 -m "image-fingerprint 0.1.0-rc.1"
git push origin v0.1.0-rc.1
```

The release workflow publishes the prerelease under `next`, automatically attaches npm provenance,
and marks the GitHub release as a prerelease. Verify the package page reports provenance before
continuing.

After OIDC succeeds, change npm **Publishing access** to **Require two-factor authentication and
disallow tokens**, then revoke any bootstrap token.

## 4. Publish the stable release

Bump `package.json` to `0.1.0` in a final release pull request. Once it is the current, fully green
`main` commit, create and push the signed `v0.1.0` tag. The same workflow publishes it under npm's
default `latest` tag and creates the stable GitHub release.
