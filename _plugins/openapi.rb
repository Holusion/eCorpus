module Jekyll
  module OAPIFilter
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

    def OAPI_schema(input, prefix="")
      if not input or not input["type"]
        Jekyll.logger.warn("Syntax Error in tag 'OAPI_schema' : Not a valid schema object : #{input}")
        return ""
      end
      case input["type"]
      when "object"
        str = "{"
        input["properties"].each do | key, schema|
          str = str + "\n#{prefix}  #{key}: #{OAPI_schema(schema, ( prefix || "")+"  ")}"
        end
        return str +"\n"+prefix+"}"
      when "array"
        return "[ #{OAPI_schema(input["items"], ( prefix || ""))} ]"

      else
        str = input["type"]
        if input["format"]
          str = str+" (#{input["format"]})"
        end

        return str
      end
    end
  end
end

Liquid::Template.register_filter(Jekyll::OAPIFilter)