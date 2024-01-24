---
title: Importing and exporting data
---

# Managing your eCorpus data

Data interoperability is one of the core features of eCorpus. 

It's simplest expression is that one can easily download some or all data from an instance and import it into another one.

It's useful for backup purposes but can also be leveraged as a way to reuse scenes from one institution to another.

## Exporting data from your eCorpus instance

### Using the interface

Navigate to the **collection** page of your eCorpus instance. Select the scenes you wish to export and click on the **Download as Zip** button.

### Using the API

```bash
curl -XGET https://${HOSTNAME}/api/v1/scenes?name=${NAME}&format=zip
```
You can add as many `name="..."` parameters as you want to the query string.

## Importing data into your eCorpus instance

### Using the API

```bash
curl -XPOST https://${HOSTNAME}/api/v1/scenes --data-binary "@${ZIP_FILE}" | jq .
```
The request returns a (potentially very large) JSON object describing the result. You can filter only failure by running `jq .fail` or if you don't have `jq` installed you can skip it and use the `curl -s --fail -o /dev/null -w "%{http_code}"`
