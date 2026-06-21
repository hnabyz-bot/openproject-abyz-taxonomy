# frozen_string_literal: true

module OpenProject
  module AbyzTaxonomy
    class Hooks < ::OpenProject::Hook::ViewListener
      render_on :view_layouts_base_html_head, partial: "hooks/abyz_taxonomy/assets"
    end
  end
end
