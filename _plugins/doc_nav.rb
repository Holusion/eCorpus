# Copied from holusion.com build plugins (https://github.com/Holusion/holusion.com/blob/master/_plugins/dev_nav.rb)

module Jekyll
  module Tags
    class DocNav < Liquid::Tag
      @@uids = 1

      def cache
        @@cache ||= Jekyll::Cache.new("DocNav")
      end
      def getUid
        @@uids += 1
        return @@uids
      end

      def initialize(tag_name, markup, tokens)
        super
      end


      # makes a tree of docs as a hash like :
      # {
      #   "fr" => {
      #     "page_path" => { :title, :url, :children }
      #   }
      # }
      def doc_tree(docs)
        tree = { "fr" =>{}, "en" => {}}
        docs.each do |doc|
          next if doc.data["type"] != "doc"
          match = /\/(?<lang>fr|en)\/doc\/((?<rest>.*)\/)?(?<last>(?!index)[^\/]+)/.match(doc.url)
          next if ! match #skip if page does not match
          lang = match["lang"]
          parts = match["rest"]? match["rest"].split("/") : []
          last_part = match["last"]

          current_hash = tree[lang]

          parts.each do |part|
            #print "current hash :#{current_hash}"
            current_hash[part] = {:children =>{}, :title => part } if not current_hash.has_key? part
            current_hash = current_hash[part][:children]
          end

          current_hash[last_part] = {
            :title => doc.data["title"],
            :rank => doc.data.has_key?("rank")? doc.data["rank"] : 0,
            :url => doc.url,
            :children =>(current_hash.has_key?(last_part)) ? current_hash[last_part][:children]: {},
            :visible => doc.data.has_key?("visible")? doc.data["visible"] : true
          } if doc.data["visible"] != false
        end

        return tree
      end

      def render_item(path, item, active_uri)
        uid = getUid

        is_active = active_uri.include? path
        title = item[:title] || path.split("/").last
        url = item[:url] || ""

        markup = %(<li class="list-group-item content-bar--link#{is_active ? " current" : ""}">)

        if item[:children].empty?
          markup += %(<a href="#{url}">#{title}</a>)
        else
          sorted_children = item[:children].sort_by { |key, val| val.has_key?(:rank)? val[:rank] : 0 }
          child_nodes = sorted_children.map do |childKey, child|
            render_item(path+"/#{childKey}", child, active_uri)
          end

          markup += %(
            <a class="dropdown-toggle" role="button" data-proofer-ignore
              data-bs-toggle="collapse"  aria-haspopup="true"
              aria-expanded="#{is_active ? "true" : "false"}"
              data-bs-target="#collapseList#{uid}"
              aria-expanded="#{ is_active ? "true" : "false"}"
              aria-controls="collapseList#{uid}">
              #{title}
            </a>
          )

          markup += %(
            <ul class="collapse list-group list-group-flush content-bar-group--sub#{is_active ? " show" : ""}"
              id="collapseList#{uid}"
            >
          )
          if url and 0 < url.length
            markup += %(
              <li class="list-group-item content-bar--link#{url == active_uri ? " current": ""}">
                <a href="#{url}">Introduction</a>
              </li>
            )
          end
          markup += child_nodes.join("\n")
          markup += %(</ul>)
        end

        markup += %(</li>)
        return markup
      end

      def render(context)
        #global site variable
        site = context.registers[:site]
        page = context.registers[:page]
        #replace variables with their current value

        lang = page["lang"]
        if not lang
          raise SyntaxError, <<~END
          Syntax Error in tag 'docnav' : require a lang to be set
          END
        end

        docs_tree = cache.getset(site.time.to_s) do
          doc_tree(site.pages)
        end

        html = %(<ul class="list-group list-group-flush content-bar-group--main">)

        html += %(<li class="list-group-item content-bar--link#{ page["url"] == %(/dev/#{lang}/index) ? " current" : ""}">
          <a href="/#{lang}/doc/">Introduction</a>
        </li>)

        sorted_localized_docs = docs_tree[lang].sort_by { |key, val| val.has_key?(:rank)? val[:rank] : 0 }
        sorted_localized_docs.each do |key, doc|
          next if doc[:children].empty?# do not render categories with no children for now
          html += render_item(key, doc, page["url"])
        end
  	    return html+"</ul>"
      end
    end
  end
end

Liquid::Template.register_tag('docnav', Jekyll::Tags::DocNav)