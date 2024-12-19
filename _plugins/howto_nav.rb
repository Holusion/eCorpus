# Copied from holusion.com build plugins (https://github.com/Holusion/holusion.com/blob/master/_plugins/dev_nav.rb)

module Jekyll
  module Tags
    class HowtoNav < Liquid::Tag
      @@uids = 1

      def cache
        @@cache ||= Jekyll::Cache.new("HowtoNav")
      end
      def getUid
        @@uids += 1
        return @@uids
      end

      def initialize(tag_name, markup, tokens)
        super
      end


      # makes a tree of howtos as a hash like :
      # {
      #   "fr" => {
      #     "page_path" => { :title, :url, :children }
      #   }
      # }
      def howto_tree(howtos)
        tree = { "fr" =>{}, "en" => {}}
        howtos.each do |howto|
          next if howto.data["type"] != "howto"
          match = /\/(?<lang>fr|en)\/howto\/((?<rest>.*)\/)?(?<last>(?!index)[^\/]+)/.match(howto.url)
          next if ! match #skip if page does not match
          lang = match["lang"]
          parts = match["rest"]? match["rest"].split("/") : []
          last_part = match["last"]

          current_hash = tree[lang]

          parts.each do |part|
            #print "current hash :#{current_hash}"
            current_hash[part] = {:children =>{}, :title => part.capitalize() } if not current_hash.has_key? part
            current_hash = current_hash[part][:children]
          end

          current_hash[last_part] = {
            :title => howto.data["title"],
            :rank => howto.data.has_key?("rank")? howto.data["rank"] : 0,
            :url => howto.url,
            :children =>(current_hash.has_key?(last_part)) ? current_hash[last_part][:children]: {},
            :visible => howto.data.has_key?("visible")? howto.data["visible"] : true
          } if howto.data["visible"] != false
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
          markup += %(<a class="list-group-leaf" href="#{url}">#{title}</a>)
        else
          sorted_children = item[:children].sort_by { |key, val| val.has_key?(:rank)? val[:rank] : 0 }
          child_nodes = sorted_children.map do |childKey, child|
            render_item(path+"/#{childKey}", child, active_uri)
          end

          markup += %(
            <a class="dropdown-toggle" role="button" 
              aria-haspopup="true"
              aria-expanded="#{is_active ? "true" : "false"}"
              data-target="#collapseList#{uid}">
              #{title}
            </a>
          )

          markup += %(
            <ul class="collapse list-group content-bar-group--sub#{is_active ? " show" : ""}"
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
          Syntax Error in tag 'howtonav' : require a lang to be set
          END
        end

        howtos_tree = cache.getset(site.time.to_s) do
          howto_tree(site.pages)
        end

        html = %(<ul class="list-group">)

        html += %(<li class="list-group-item content-bar--link#{ page["url"] == %(/dev/#{lang}/index) ? " current" : ""}">
          <a href="/#{lang}/howto/">Introduction</a>
        </li>)

        sorted_localized_howtos = howtos_tree[lang].sort_by { |key, val| val.has_key?(:rank)? val[:rank] : 0 }
        sorted_localized_howtos.each do |key, howto|
          next if howto[:children].empty?# do not render categories with no children for now
          html += render_item(key, howto, page["url"])
        end
  	    return html+"</ul>"
      end
    end
  end
end

Liquid::Template.register_tag('howtonav', Jekyll::Tags::HowtoNav)