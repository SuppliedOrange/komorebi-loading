# Release Automation Guide

This repository uses GitHub Actions to automatically build and release komorebi-loading executables.

## Quick Start

### Option 1: Tag-Based Release (Recommended)
Push a version tag to create a new release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Option 2: Manual Trigger
1. Go to [Actions → Build and Release](../../actions/workflows/release.yml)
2. Click "Run workflow"
3. Optionally specify a version tag (default: "dev-build")
4. Click "Run workflow"

### Option 3: Automatic on Push
Pushing to `main` or `copilot/test-release-builds` automatically triggers a build with a timestamped version.

## How It Works

The workflow (`release.yml`) performs these steps:

1. **Checkout**: Gets the repository code
2. **Setup Node.js**: Installs Node.js 20
3. **Install Dependencies**: Runs `npm install`
4. **Build**: Creates Windows executable using @electron/packager
5. **Version**: Determines the version based on trigger type
6. **Package**: Creates a ZIP archive with all necessary files
7. **Upload Artifact**: Stores build as workflow artifact
8. **Create Release**: Creates GitHub release with the ZIP file

## Version Naming

- **Tag push** (`v1.0.0`): Uses the exact tag name
- **Manual trigger**: Uses the version you specify (or "dev-build")
- **Branch push**: Generates `v{package.json version}-{branch-name}-{timestamp}`

## Release Types

### Production Releases
- Triggered by pushing tags matching `v*.*.*` (e.g., `v1.2.3`)
- Created as regular releases (not pre-releases)
- Best for stable versions

### Pre-releases
- Triggered by pushes to `copilot/test-release-builds` branch
- Created as pre-releases
- Best for testing before production

### Development Builds
- Triggered manually via workflow_dispatch
- Created as pre-releases
- Best for one-off testing

## Testing the Workflow

The `copilot/test-release-builds` branch is configured for testing:

1. Make changes to the workflow file
2. Push to `copilot/test-release-builds`
3. Workflow runs automatically
4. Check the Actions tab for results
5. Release is created as a pre-release

## Troubleshooting

### Workflow shows "action_required"
This means the workflow needs approval:
- Repository admins can approve in the Actions tab
- This is a safety feature for first-time workflows

### Build fails
Check the workflow logs:
1. Go to Actions tab
2. Click on the failed workflow run
3. Click on the failed job
4. Review the logs for each step

### Release not created
Verify:
- Workflow has `contents: write` permission (already configured)
- `GITHUB_TOKEN` has sufficient permissions
- No existing release with the same tag

## Customization

### Change Build Target
Edit `.github/workflows/release.yml` line 35:
```yaml
run: npx @electron/packager . komorebi-loading --out=dist --icon=assets/cat.ico --overwrite --platform=win32
```

Change `--platform=win32` to:
- `linux` for Linux builds
- `darwin` for macOS builds
- `all` for all platforms

### Change Version Scheme
Edit the "Determine version and create tag" step in the workflow file.

### Change Release Notes
Edit the `body:` section in the "Create Release" step.

## Best Practices

1. **Test First**: Always test changes on `copilot/test-release-builds` before merging to main
2. **Use Tags**: For production releases, use semantic versioning tags (v1.0.0)
3. **Update Changelog**: Maintain a CHANGELOG.md for major releases
4. **Review Builds**: Download and test builds before announcing
5. **Clean Up**: Delete old pre-release builds to save space

## Examples

### Creating a new stable release
```bash
# Update version in package.json
npm version 1.3.0 --no-git-tag-version

# Commit the change
git add package.json
git commit -m "Bump version to 1.3.0"

# Create and push tag
git tag v1.3.0
git push origin main
git push origin v1.3.0
```

### Creating a test release
```bash
# Push to test branch
git checkout copilot/test-release-builds
git merge main
git push origin copilot/test-release-builds
```

### Creating a quick dev build
1. Go to Actions → Build and Release
2. Click "Run workflow"
3. Branch: `main`
4. Version: `v1.3.0-beta1`
5. Click "Run workflow"

## Support

For issues with the workflow:
- Check [GitHub Actions documentation](https://docs.github.com/en/actions)
- Review workflow logs in the Actions tab
- Check [electron-packager documentation](https://github.com/electron/packager)
