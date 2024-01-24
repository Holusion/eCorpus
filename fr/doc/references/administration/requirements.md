---
title: Hardware requirements
---

# eCorpus requirements

## Requirements

A small eCorpus instance can run on approximately any device.

all storage and database operations happens on Disk (see [sqlite](https://www.sqlite.org/about.html)) so a fast reliable and durable local storage medium is **required**.

### Hardware requirements

 > depends heavily on expected traffic and corpus size.

As a minimum, expect : 

 - CPU: any dual-core or better CPU
 - RAM: 2GB or more. Memory usage should scale linearly with dataset size
 - Storage: Dataset-dependant

It has been verified to work on systems as small as 1GB RAM and 1 vCPU with a small dataset and low connection volume.

### Software requirements:

 - [nodejs](https://nodejs.org/) v16 (LTS) or greater
 - the underlying system should have [shared memory](https://en.wikipedia.org/wiki/Shared_memory) support (for sqlite's [WAL Log](https://sqlite.org/wal.html)) - any modern OS should be OK.

a toolchain to compile native nodejs addons might be required if [node-sqlite3](https://github.com/TryGhost/node-sqlite3/releases) doesn't provide a working prebuilt module for your platform.

Alternatively, use [Docker](https://www.docker.com/).

## Production optimization

Set the database to WAL mode with `PRAGMA journal_mode = WAL` can greatly speed up operations. Memory tuning using `PRAGMA soft_heap_limit` could help.

Ensuring the file system is able to handle a lot of files in a single directory may be important. Use `tune2fs` to enable **dir_index** for **ext[234]** file systems.

The `Cache-Control` header is very restrictive by default to allow fine-grained access-control. If all the objects are public, it could be replaced by `Cache-Control: public` in most places.

## Limitations

eCorpus over sqlite is well capable of handling a few thousands of objects with some level of concurrency, serving a medium sized public-facing website.

For anything substantially larger, switching to another database engine or using a system designed for scale like [dpo-pakrat](https://github.com/Smithsonian/dpo-packrat) would be recommended.
