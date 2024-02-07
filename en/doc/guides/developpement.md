---
title: Development 
---

## Development

### Keeping in sync

This repository is kept in sync with [upstream](https://github.com/Smithsonian/dpo-voyager){:target="_blank"}.

```
git merge -m "merge branch 'master' on $(git rev-parse --short master)" master
```

### submodules

Especially after a sync with master, updating the submodules is necessary. eg:

```
git submodule update --recursive
```

Removing eventual local changes to submodules is done with : 

```
git submodule foreach --recursive git reset --hard
```

To check out a not-yet-upstreamed feature in a submodule, it's necessary to use holusion's copy (at `https://github.com/Holusion/ff-*`). Preferably, create a feature branch, contribute it upstream and **very temporarily** use it if strictly necessary.

Edit the `.gitmodules` to change the source URL, then run : 

    git submodule sync --recursive

Then in the change module's folder (ie. `libs/ff-x`)

```
cd libs/ff-xx
git fetch
git checkout origin/<feature-branch>
```

Finally, in the root folder : 

```
git add libs/ff-x
```

Commit the changes to the submodule's URL and HEAD.

[^1]: Described here [friendly forks management](https://github.blog/2022-05-02-friend-zone-strategies-friendly-fork-management/#git-for-windows-git)


### Tests

The server part of the code is tested with [mocha](https://mochajs.org/){:target="_blank"} and [chai](https://www.chaijs.com/){:target="_blank"}. See `source/server/**/*.test.js`.

Run unit tests with :

```
npm test
```

Or to select specific tests :

```
(cd source/server && npm test -- --grep "test name")
```

> Some lines in `console.log` are disabled to make standard test output more readable. They can be reactivated by forcing the `TEST=0` variable on the command line.

### Synchronization with the original repository

This repository is synchronized with [upstream](https://github.com/Smithsonian/dpo-voyager){:target="_blank"}. Changes are made in a `master` branch and merged with the `upstream/master` branch. It's important to keep code porting as simple as possible (see for example: [friendly forks management](https://github.blog/2022-05-02-friend-zone-strategies-friendly-fork-management/#git-for-windows-git){:target="_blank"}).

```
git merge -m "merge branch 'master' on $(git rev-parse --short master)" master
```