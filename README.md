

## Installation (for local development)

#### Clone this repository

```bash
git clone --branch gh_pages --filter=blob:none git@github.com:Holusion/eCorpus.git eCorpus_doc
cd eCorpus_doc
```

#### Install dependencies
  
Having a working [rvm](https://rvm.io/) setup or any equivalent ruby version manager is recommended.

```bash
gem install bundler
bundle install
bundle exec jekyll serve
```

### Auto regeneration on WSL

Having trouble on auto regeneration on WSL2, try

```bash
bundle exec jekyll serve --force-polling
```