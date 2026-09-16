---
title: Hardware requirements
rank: 2
---

## Hardware requirements

### Requirements

A small eCorpus instance can run on approximately any device.

Object files are stored on disk and metadata is stored in a [PostgreSQL](https://www.postgresql.org/){:target="_blank"} database, so a fast, reliable and durable local storage medium is **required**.

#### Hardware requirements

 > Depends heavily on expected traffic and corpus size.

As a minimum, expect : 

 - CPU: any dual-core or better CPU
 - RAM: 2GB or more. Memory usage should scale linearly with dataset size
 - Storage: Dataset-dependant

It has been verified to work on systems as small as 1GB RAM and 1 vCPU with a small dataset and low connection volume.

#### Software requirements:

 - [nodejs](https://nodejs.org/){:target="_blank"} v18 (LTS) or greater (v20+ if building from source)
 - a [PostgreSQL](https://www.postgresql.org/){:target="_blank"} server (local or remote). The provided `docker-compose.yml` uses PostgreSQL 17.

Alternatively, use [Docker](https://www.docker.com/){:target="_blank"}, which bundles both in a single `docker compose up`.

### Production optimization

Tune the PostgreSQL server for your workload (`shared_buffers`, `work_mem`, connection limits, etc.) - the defaults of most distributions are conservative for anything beyond light use.

Ensuring the file system is able to handle a lot of files in a single directory may be important. Use `tune2fs` to enable **dir_index** for **ext[234]** file systems.

The `Cache-Control` header is very restrictive by default to allow fine-grained access-control. If all the objects are public, it could be replaced by `Cache-Control: public` in most places.

### Limitations

eCorpus over PostgreSQL is well capable of handling a few thousands of objects with some level of concurrency, serving a medium sized public-facing website.

For anything substantially larger, switching to another database engine or using a system designed for scale like [dpo-pakrat](https://github.com/Smithsonian/dpo-packrat){:target="_blank"} would be recommended.
