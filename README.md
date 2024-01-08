# eCorpus

## Description

This is the code repository for **eCorpus**, a content management system by the [eThesaurus](https://ethesaurus.holusion.com) consortium.

## Installation

Follow the [Quick Start Guide](https://ethesaurus.holusion.com/en/doc/tutorials/deployment.html).

## Repository structure

The repository uses recursive [submodules](https://git-scm.com/docs/gitsubmodules), because the upstream [DPO-Voyager](https://github.com/) uses them.

It means some commands will need to be run with the `--recurse-submodules` flag, or you will need to run `git submodule update --init --recursive` after cloning the repository.

eg: `git clone --recurse-submodules git@github.com:Holusion/eCorpus`

Day-to-day operations can be simplified by configuring git (globally or for thsi repository) to always recurse by default : `git config submodule.recurse true`.

