
### Keeping in sync

This repository is kept in sync with [upstream](https://github.com/Smithsonian/dpo-voyager).

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

    cd libs/ff-xx
    git fetch
    git checkout origin/<feature-branch>

Finally, in the root folder : 

    git add libs/ff-x

Commit the changes to the submodule's URL and HEAD.

[^1]: Described here [friendly forks management](https://github.blog/2022-05-02-friend-zone-strategies-friendly-fork-management/#git-for-windows-git)
