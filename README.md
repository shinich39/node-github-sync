# node-github-sync

Synchronize files with github repo.

## Usage

```js
// PROJECT_ROOT_DIR/ngs.config.json
{
  "output/node-py.mjs": "shinich39/node-github-sync/dist/node-github-sync.min.mjs"
}
```

```js
import { sync } from "node-file-sync";

;(async () => {
  // Personal Access Token
  // "Contents" repository permissions (read)
  // GitHub API requests are limited to 60 requests per hour
  // https://github.com/settings/tokens

  const tokens = {
    "shinich39": {
      "node-file-sync": "Personal Access Token"
    },

    // "OWNER": {
    //   "REPOSITORY": "TOKEN",
    // }
  }

  await sync(tokens);
  // 1. Download files that is not exists.
  // 2. Download files that repository updated.
})();
```

## References

- [octokit.js](https://github.com/octokit/octokit.js)