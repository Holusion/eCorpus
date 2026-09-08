module Jekyll
  module OffsetHeadersFilter
    # Demote <h1>-<h6> in an HTML fragment by `offset` levels, clamped to h6.
    # Runs on markdownify output, where heading-like text in code blocks is
    # already entity-escaped, so only real heading tags are rewritten.
    def offset_headers(html, offset = 2)
      html.to_s.gsub(%r{<(/?)h([1-6])(?=[\s>])}i) do
        "<#{$1}h#{[$2.to_i + offset, 6].min}"
      end
    end
  end
end

Liquid::Template.register_filter(Jekyll::OffsetHeadersFilter)
