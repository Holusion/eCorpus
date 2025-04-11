---
title:  Development 
---

## Development

### Getting Started

See the [quick installation guide](/fr/doc/hosting/deployment).

Use the command: `npm run watch` to enable automatic recompilation.

### submodules

Especially after synchronizing with the original repository, it is necessary to update the submodules. For example:

```
git submodule update --recursive
```

Or if the clone was done incorrectly. (without `--recurse-submodules`) :

```
git submodule update --init --recursive
```

To remove any local changes made to the submodules, use:

```
git submodule foreach --recursive git reset --hard
```

To verify a feature that has not yet been integrated into a submodule, it is necessary to use the Holusion copy (via `https://github.com/Holusion/ff-*`). Preferably, create a feature branch, contribute it upstream, and use it **very temporarily** if absolutely necessary.

Modify the `.gitmodules` file to change the source URL, then run:

    git submodule sync --recursive

Then, in the changed module folder (i.e., `libs/ff-x`) :
```
cd libs/ff-xx
git fetch
git checkout origin/<feature-branch>
```

Finally, in the root folder:
```
git add libs/ff-x
```

Commit the changes to the URL and the submodule's HEAD.

### Tests

The server part of the code is tested with [mocha](https://mochajs.org/){:target="_blank"} and [chai](https://www.chaijs.com/){:target="_blank"}. See `source/server/**/*.test.js`.

Run the unit tests with:

```
npm test
```

Or to select specific tests:

```
(cd source/server && npm test -- --grep "test name")
```

 > Some `console.log` lines are disabled to make the standard output of the tests more readable. They can be reactivated by forcing the `TEST=0` variable in the command line.

### Synchronization with the original repository

This repository is synchronized with [upstream](https://github.com/Smithsonian/dpo-voyager){:target="_blank"}. The changes are made in a `master` branch and are merged with the `upstream/master`branch. It is important to keep the code porting as simple as possible (see for example: [friendly forks management](https://github.blog/2022-05-02-friend-zone-strategies-friendly-fork-management/#git-for-windows-git){:target="_blank"}).

```
git merge -m "merge branch 'master' on $(git rev-parse --short master)" master
```