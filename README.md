# eCorpus

## Description

This is the code repository for **eCorpus**, a content management system by the [eThesaurus](https://ecorpus.eu/en/about.html) consortium.

## Installation

If you happen to have access to a running eCorpus instance, simply follow the [Quick Start Guide](https://ecorpus.eu/en/doc/tutorials/).

This guide is also available [in french](https://ecorpus.eu/fr/doc/tutorials/).

You can otherwise head over to a Standalone "sandbox" scene on our [test server](https://ecorpus.holusion.com/ui/standalone/) or learn how to spin up your own [eCorpus instance](https://ecorpus.eu/en/doc/guides/deployment.html).

## Project Goals

**eCorpus** aims to provide a management layer over the DPO-Voyager Open Source 3D explorer and authoring suite. It has built-in history revision management, users roles with access controls and service management capabilities.

We strive to make the software as lightweight and interoperable as possible. 

## Report a bug

You found a bug or an unexpected behaviour? Head to the [issues](https://github.com/Holusion/eCorpus/issues?q=is%3Aissue) board, **but don't forget to**:

- check if your problem has already been reported by someone else
- try to explain how to reproduce it **from a newly created scene** (if possible)
  - tell us on which page it happened, and in which language
  - explain the detailed steps you took
  - attach screenshots when useful
- attach any resource that would be required to reproduce the bug (eg. a specific model or scene)


**Note**: Security issues can be [privately reported](https://docs.github.com/fr/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) if necessary.

## Development

### Testing eCorpus

eCorpus uses a two-stage testing strategy :

- **Unit tests** and **Integration tests** for server side logic and APIs that aims to catch any security and reliability issues. Those tests are found withing the repository under `source/server/**/*.test.ts`
- **End to End** tests run on an automated browser environment that aims to ensure actual usability of the software. 


### Repository structure

The repository uses recursive [submodules](https://git-scm.com/docs/gitsubmodules), because the upstream [DPO-Voyager](https://github.com/Smithsonian/DPO-Voyager.git) uses them.

It means some commands will need to be run with the `--recurse-submodules` flag, or you will need to run `git submodule update --init --recursive` after cloning the repository.

eg: `git clone --recurse-submodules git@github.com:Holusion/eCorpus`

Day-to-day operations can be simplified by configuring git (globally or for thsi repository) to always recurse by default : `git config submodule.recurse true`.

