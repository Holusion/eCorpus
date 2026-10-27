# Build a left sidebar navigation out of the <section id="..."> blocks of a page,
# using the same markup as the docnav tag so that a page laid out with
# "_layouts/gallery.html" gets a sidebar identical to the tutorial pages.
#
# Usage in a layout :  {{ content | section_nav }}
#
# The label of each entry is the text of the first <h2> found in the section.
module Jekyll
  module SectionNav
    SECTION_RE = %r{<section\b(?<attrs>[^>]*)>(?<body>.*?)</section>}m
    ID_RE      = /\bid="(?<id>[^"]+)"/
    TITLE_RE   = %r{<h2\b[^>]*>(?<title>.*?)</h2>}m

    def section_nav(html)
      items = []

      html.to_s.scan(SECTION_RE) do |attrs, body|
        id = attrs.match(ID_RE)
        next unless id

        title_html = body.match(TITLE_RE)
        next unless title_html

        title = title_html[:title].gsub(%r{<[^>]*>}, " ").gsub(/\s+/, " ").strip
        next if title.empty?

        items << { :id => id[:id], :title => title }
      end

      return "" if items.empty?

      out = %(<ul class="list-group section-nav">\n)
      items.each do |item|
        out << %(  <li class="list-group-item content-bar--link">)
        out << %(<a class="list-group-leaf" href="##{item[:id]}">#{item[:title]}</a>)
        out << %(</li>\n)
      end
      out << %(</ul>)
    end
  end
end

Liquid::Template.register_filter(Jekyll::SectionNav)
