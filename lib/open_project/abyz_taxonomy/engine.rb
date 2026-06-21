# frozen_string_literal: true

module OpenProject
  module AbyzTaxonomy
    class Engine < ::Rails::Engine
      engine_name :openproject_abyz_taxonomy

      include OpenProject::Plugins::ActsAsOpEngine

      register(
        "openproject-abyz-taxonomy",
        author_url: "https://abyz-lab.work",
        requires_openproject: ">= 17.5.0"
      )

      add_api_endpoint "API::V3::Root" do
        require "api/v3/abyz_taxonomy/abyz_taxonomy_api"

        mount ::API::V3::AbyzTaxonomy::AbyzTaxonomyAPI
      end

      add_api_endpoint "API::V3::Projects::ProjectsAPI", :id do
        require "api/v3/abyz_taxonomy/project_abyz_taxonomy_api"

        mount ::API::V3::AbyzTaxonomy::ProjectAbyzTaxonomyAPI
      end

      config.to_prepare do
        require "open_project/abyz_taxonomy/hooks"
      end
    end
  end
end
