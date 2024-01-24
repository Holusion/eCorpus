source 'https://rubygems.org'

# You may use http://rbenv.org/ or https://rvm.io/ to install and use this version
ruby File.read(File.join(__dir__, '.ruby-version')).strip

group :core do
  gem 'jekyll', "~>4.3.2"
  gem 'wdm', ">=0.1.0" if Gem.win_platform?
end

group :plugins do
  gem 'jekyll-sitemap', "~>1.4.0"
  gem 'jekyll-last-modified-at', "~>1.3.0"
end

group :test do
  gem 'html-proofer', "~>4.4.3"
end