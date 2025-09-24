
def xml_comment(str)
  return "<!-- #{str} -->"
end


module Jekyll
  module OAPIFilter
    ##
    # Recursively resolves `$ref` keys in an OpenAPI schema.
    # Only searches for local definitions, will not load any external file reference
    # @param [Hash] input a fragment of an OpenAPI specification document
    # @param [Hash] context parent OpenAPI document
    def OAPI_dereference(input, context=nil)
      if not context
        context = input
      end
      if input.is_a?(Hash)
        output = {}
        input.each do |key, value|
          if key == "$ref"
            if not value.is_a?(String) or not value.start_with?("#/")
              Jekyll.logger.warn("Syntax Error in tag 'OAPI_dereference' : Bad reference pointer : #{value}")
              return
            end
            ptr = context
            value.split("/")[1, 10]. each do |part|
              ptr = ptr[part]
              if not ptr
                Jekyll.logger.warn("Syntax Error in tag 'OAPI_dereference' : Bad reference pointer : #{value} (\"#{part}\" not found)")
              end
            end
            return OAPI_dereference(ptr, context)
          else
            output[key] = OAPI_dereference(value, context)
          end
        end
        return output
      elsif input.is_a?(Array)
        return input.collect { |value| OAPI_dereference(value, context) }
      else
        return input
      end
    end

    ##
    # Parse a parameter object (as in: operation.parameters)
    # @see https://spec.openapis.org/oas/v3.1.0.html#parameter-object
    def OAPI_parameters(input)
      output = {"query" => [], "path" => [], "header" => [], "cookie" => []}
      return output if not input
      input.each do |param|
        if not param["in"]
          print "Bad parameter : "+param.inspect()
          return
        end
        output[param["in"]].push(param)
      end
      return output
    end

    ##
    # Converts a JSON-Schema into a (simplified!) XML representation of the object
    # @param [Hash] input a JSON-Schema 
    # @see https://datatracker.ietf.org/doc/html/draft-bhutton-json-schema-00
    def OAPI_XML_schema(input, prefix="", jsonName="xml", parent=nil)
      if not input.is_a?(Hash) or not input["type"]
        Jekyll.logger.warn("Syntax Error in tag 'OAPI_XML_schema' : Not a valid schema object : #{input.inspect()}")
        return ""
      end
      xmlDef = input["xml"]
      name = jsonName
      attrs = {}
      content= ""
      if xmlDef
        if xmlDef["name"] then name = xmlDef["name"] end
        if xmlDef["prefix"] then name = xmlDef["prefix"]+":"+name end
        if xmlDef["namespace"]
          ns = if xmlDef["prefix"] then "xmlns:#{xmlDef["prefix"]}" else "xmlns" end 
          attrs[ns] = xmlDef["namespace"]
        end
      end
      
      case input["type"]
      when "object"
        input["properties"].each do | key, schema|
          content += "\n#{prefix}"+OAPI_XML_schema(schema, ( prefix || "")+"  ", key, attrs)
        end if not input["properties"].nil?
      when "array"
        return "#{OAPI_XML_schema(input["items"], ( prefix || ""), name, attrs)}\n#{prefix}#{xml_comment("Array of <#{name}>")}"
      when "string"
        if input["format"] == "binary"
          content += "Buffer"
        elsif input["example"]
          content += input["example"]
        elsif input["examples"]
          content += input["examples"].to_a[0][1]["value"]
        else
          content += "string"
        end
        if input["summary"]
          content = content + "  #{xml_comment(input["summary"])}"
        elsif input["pattern"]
          content = content + xml_comment("/#{input["pattern"]}/")
        end
      else
        content += input["type"]
        if input["format"]
          content = content + xml_comment(" (#{input["format"]})")
        end
        if input["summary"]
          content = content + xml_comment("#{input["summary"]}")
        end
      end

      strAttrs = attrs.reduce(""){|str, (key, val)| str+" #{key}=\"#{val}\"" }

      return "#{prefix}<#{name}#{strAttrs}>#{content}#{if content.include?("\n") then "\n#{prefix}" else "" end}</#{name}>"
    end

    ##
    # Converts a JSON-Schema into a (simplified!) TypeScript-like textual representation of the object
    # @param [Hash] input a JSON-Schema 
    # @see https://datatracker.ietf.org/doc/html/draft-bhutton-json-schema-00
    def OAPI_schema(input, prefix="")
      if not input.is_a?(Hash) or not input["type"]
        Jekyll.logger.warn("Syntax Error in tag 'OAPI_schema' : Not a valid schema object : #{input.inspect()}")
        return ""
      end

      case input["type"]
      when "object"
        str = "{"
        input["properties"].each do | key, schema|
          required = (input["required"] and input["required"].index(key) != nil)
          str = str + "\n#{prefix}  #{key}#{if required then "" else "?" end}: #{OAPI_schema(schema, ( prefix || "")+"  ")}"
        end if not input["properties"].nil?
        if input["additionalProperties"]
          props = input["additionalProperties"]
          str = str + "\n#{prefix}  [#{props["type"]}]?: #{OAPI_schema(props, "#{prefix}  ")}"
        end
        str = "#{str}\n#{prefix}}"
      when "array"
        str =  "[ #{OAPI_schema(input["items"], ( prefix || ""))} ]"
      when "string"
        # First check if "string" is in fact a binary blob
        if input["format"] == "binary"
          str = "Buffer"
        end
        # Then check for an enum type
        if input["enum"]
          str = input["enum"].map { |v| "\"#{v}\""} .join("|")
        else
          str = "\"string\""
        end

      else #default case
        str = input["type"]
        if input["format"]
          str = str + " (#{input["format"]})"
        end
      end

      if input["pattern"]
        str = "#{str} // /#{input["pattern"]}/"
      end
      
      # Add any useful info
      if input["summary"]
        str = "#{str} //#{input["summary"]}"
      elsif input["description"]
        str = "#{str} //#{input["description"].split("\n").join("\n#{"".rjust(str.length," ")} //")}"
      end

      return str
    end
  end
end

Liquid::Template.register_filter(Jekyll::OAPIFilter)