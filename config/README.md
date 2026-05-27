# config/

This folder is intentionally empty.

**The real configuration file is [`../js/config.js`](../js/config.js).** Put your
three Google IDs there:

```js
window.VMSConfig = {
  APPS_SCRIPT_URL:      '...',
  SHEET_ID:             '...',
  DRIVE_ROOT_FOLDER_ID: '...',
  // ...marketplaces, couriers, retention, etc.
};
```

This `/config/` folder exists as a reserved location for future environment-
specific config files (e.g. a `staging.js` vs `production.js` split if the
project ever grows past one deployment).

See [../docs/SETUP.md](../docs/SETUP.md) step 4 for the full walkthrough.
