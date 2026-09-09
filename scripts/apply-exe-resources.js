// electron-builder's default resource-editing/signing step needs to download
// and extract a helper archive that contains unrelated macOS symlinked files;
// extracting those requires a Windows privilege ("create symbolic link") that
// a non-admin, non-Developer-Mode account doesn't have, so that step fails on
// a plain dev machine (see README/build notes). We build with
// win.signAndEditExecutable=false to skip it, and instead apply the icon and
// version metadata ourselves here using the standalone `rcedit` package,
// which bundles its own rcedit.exe and needs nothing else.
const path = require('path');
const { rcedit } = require('rcedit');
const pkg = require('../package.json');

const exePath = path.join(__dirname, '..', 'dist', 'win-unpacked', `${pkg.build.productName}.exe`);

rcedit(exePath, {
  icon: path.join(__dirname, '..', 'assets', 'icons', 'icon.ico'),
  'version-string': {
    ProductName: pkg.build.productName,
    FileDescription: pkg.description,
    CompanyName: pkg.author,
    LegalCopyright: `Copyright (c) ${new Date().getFullYear()}`
  },
  'file-version': pkg.version,
  'product-version': pkg.version
})
  .then(() => console.log('Applied icon and version resources to', exePath))
  .catch((err) => {
    console.error('rcedit failed:', err);
    process.exit(1);
  });
